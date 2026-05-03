from datetime import timedelta
from django.utils import timezone
from .models import Task, TaskGroup
from projects.models import ProjectMembership


def get_project_metric_groups(project):
    return list(
        TaskGroup.objects
        .filter(project=project)
        .order_by("position", "id")
    )


def get_project_metric_tasks(project):
    return list(
        Task.objects
        .filter(group__project=project)
        .select_related("group", "assignee")
        .prefetch_related("tags")
        .order_by("group__position", "position", "id")
    )


def get_points_value(task):
    return int(task.story_points or 0)


def get_percent(part, total):
    if total <= 0:
        return 0

    return round((part / total) * 100)


def serialize_metric_task(task):
    return {
        "id": task.id,
        "title": task.title,
        "parent_task": task.parent_task_id,
        "group_id": task.group_id,
        "group_name": task.group.name,
        "start_date": task.start_date.isoformat() if task.start_date else None,
        "deadline": task.deadline.isoformat() if task.deadline else None,
        "is_completed": task.is_completed,
        "assignee": task.assignee_id,
        "assignee_email": task.assignee.email if task.assignee else None,
        "story_points": get_points_value(task),
    }


def calculate_task_completion(tasks):
    total_tasks = len(tasks)
    completed_tasks = sum(1 for task in tasks if task.is_completed)
    open_tasks = total_tasks - completed_tasks

    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "open_tasks": open_tasks,
        "completion_percent": get_percent(completed_tasks, total_tasks),
    }


def calculate_points_progress(tasks):
    total_points = sum(get_points_value(task) for task in tasks)

    completed_points = sum(
        get_points_value(task)
        for task in tasks
        if task.is_completed
    )

    remaining_points = sum(
        get_points_value(task)
        for task in tasks
        if not task.is_completed
    )

    return {
        "total_points": total_points,
        "completed_points": completed_points,
        "remaining_points": remaining_points,
        "progress_percent": get_percent(completed_points, total_points),
    }


def get_overdue_tasks(tasks, today):
    return [
        task for task in tasks
        if task.deadline and task.deadline < today and not task.is_completed
    ]


def get_upcoming_deadline_tasks(tasks, today, days=7):
    limit_date = today + timedelta(days=days)

    return [
        task for task in tasks
        if (
            task.deadline
            and today <= task.deadline <= limit_date
            and not task.is_completed
        )
    ]


def get_unassigned_open_tasks(tasks):
    return [
        task for task in tasks
        if not task.assignee_id and not task.is_completed
    ]


def calculate_risks(tasks, today):
    overdue_tasks = get_overdue_tasks(tasks, today)
    upcoming_deadline_tasks = get_upcoming_deadline_tasks(tasks, today)
    unassigned_open_tasks = get_unassigned_open_tasks(tasks)

    return {
        "overdue_tasks_count": len(overdue_tasks),
        "upcoming_deadlines_count": len(upcoming_deadline_tasks),
        "unassigned_open_tasks_count": len(unassigned_open_tasks),
        "overdue_tasks": [
            serialize_metric_task(task)
            for task in sorted(
                overdue_tasks,
                key=lambda item: (item.deadline, item.position, item.id),
            )[:8]
        ],
        "upcoming_deadlines": [
            serialize_metric_task(task)
            for task in sorted(
                upcoming_deadline_tasks,
                key=lambda item: (item.deadline, item.position, item.id),
            )[:8]
        ],
        "unassigned_open_tasks": [
            serialize_metric_task(task)
            for task in sorted(
                unassigned_open_tasks,
                key=lambda item: (item.deadline or today, item.position, item.id),
            )[:8]
        ],
        "_raw_overdue_count": len(overdue_tasks),
        "_raw_unassigned_count": len(unassigned_open_tasks),
    }


def calculate_velocity(tasks, now):
    completed_last_7_days = [
        task for task in tasks
        if (
            task.is_completed
            and task.completed_at
            and task.completed_at >= now - timedelta(days=7)
        )
    ]

    completed_last_30_days = [
        task for task in tasks
        if (
            task.is_completed
            and task.completed_at
            and task.completed_at >= now - timedelta(days=30)
        )
    ]

    return {
        "completed_tasks_last_7_days": len(completed_last_7_days),
        "completed_points_last_7_days": sum(
            get_points_value(task)
            for task in completed_last_7_days
        ),
        "completed_tasks_last_30_days": len(completed_last_30_days),
        "completed_points_last_30_days": sum(
            get_points_value(task)
            for task in completed_last_30_days
        ),
    }


def calculate_status_distribution(groups, tasks):
    status_distribution = []

    for group in groups:
        group_tasks = [task for task in tasks if task.group_id == group.id]

        group_total_points = sum(
            get_points_value(task)
            for task in group_tasks
        )

        group_completed_points = sum(
            get_points_value(task)
            for task in group_tasks
            if task.is_completed
        )

        status_distribution.append(
            {
                "group_id": group.id,
                "group_name": group.name,
                "group_color": group.color,
                "tasks_count": len(group_tasks),
                "completed_tasks_count": sum(
                    1 for task in group_tasks if task.is_completed
                ),
                "total_points": group_total_points,
                "completed_points": group_completed_points,
            }
        )

    return status_distribution


def calculate_gantt_tasks(tasks):
    gantt_tasks = []

    for task in tasks:
        if not task.start_date and not task.deadline:
            continue

        gantt_tasks.append(serialize_metric_task(task))

    return gantt_tasks


def calculate_project_health(points_progress, task_completion, risks):
    progress_percent = points_progress["progress_percent"]
    open_tasks = task_completion["open_tasks"]

    overdue_count = risks["_raw_overdue_count"]
    unassigned_count = risks["_raw_unassigned_count"]

    overdue_ratio = overdue_count / open_tasks if open_tasks > 0 else 0
    unassigned_ratio = unassigned_count / open_tasks if open_tasks > 0 else 0

    deadline_score = max(0, 100 - round(overdue_ratio * 100))
    assignment_score = max(0, 100 - round(unassigned_ratio * 100))

    health_score = round(
        progress_percent * 0.55
        + deadline_score * 0.30
        + assignment_score * 0.15
    )

    if health_score >= 80:
        health_status = "Good"
    elif health_score >= 55:
        health_status = "Risky"
    else:
        health_status = "Critical"

    return {
        "score": health_score,
        "status": health_status,
        "progress_percent": progress_percent,
        "deadline_score": deadline_score,
        "assignment_score": assignment_score,
    }


def build_project_metrics(project):
    today = timezone.localdate()
    now = timezone.now()

    groups = get_project_metric_groups(project)
    tasks = get_project_metric_tasks(project)

    points_progress = calculate_points_progress(tasks)
    task_completion = calculate_task_completion(tasks)
    risks = calculate_risks(tasks, today)
    velocity = calculate_velocity(tasks, now)
    status_distribution = calculate_status_distribution(groups, tasks)
    gantt_tasks = calculate_gantt_tasks(tasks)
    health = calculate_project_health(
        points_progress=points_progress,
        task_completion=task_completion,
        risks=risks,
    )

    risks.pop("_raw_overdue_count", None)
    risks.pop("_raw_unassigned_count", None)

    return {
        "project": {
            "id": project.id,
            "name": project.name,
        },
        "health": health,
        "points_progress": points_progress,
        "task_completion": task_completion,
        "risks": risks,
        "velocity": velocity,
        "status_distribution": status_distribution,
        "gantt": {
            "tasks": gantt_tasks,
        },
    }

def get_user_metric_tasks(project):
    return list(
        Task.objects
        .filter(group__project=project)
        .select_related("group", "assignee")
        .prefetch_related("tags")
        .order_by("group__position", "position", "id")
    )


def get_project_members_for_metrics(project):
    return list(
        ProjectMembership.objects
        .filter(project=project)
        .select_related("user", "project_role")
        .order_by("id")
    )


def calculate_user_completion_rate(completed_tasks_count, assigned_tasks_count):
    if assigned_tasks_count <= 0:
        return 0

    return round((completed_tasks_count / assigned_tasks_count) * 100)


def calculate_user_contribution_score(
    completion_rate,
    completed_points,
    max_completed_points,
    overdue_tasks_count,
    assigned_tasks_count,
):
    points_score = 0

    if max_completed_points > 0:
        points_score = round((completed_points / max_completed_points) * 100)

    overdue_penalty = 0

    if assigned_tasks_count > 0:
        overdue_penalty = round((overdue_tasks_count / assigned_tasks_count) * 100)

    score = round(
        completion_rate * 0.45
        + points_score * 0.40
        - overdue_penalty * 0.15
    )

    return max(0, min(100, score))


def serialize_user_metric_task(task):
    return {
        "id": task.id,
        "title": task.title,
        "parent_task": task.parent_task_id,
        "group_id": task.group_id,
        "group_name": task.group.name,
        "start_date": task.start_date.isoformat() if task.start_date else None,
        "deadline": task.deadline.isoformat() if task.deadline else None,
        "is_completed": task.is_completed,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "story_points": get_points_value(task),
    }


def build_project_user_metrics(project):
    today = timezone.localdate()

    tasks = get_user_metric_tasks(project)
    memberships = get_project_members_for_metrics(project)

    assigned_tasks = [task for task in tasks if task.assignee_id]
    unassigned_tasks = [task for task in tasks if not task.assignee_id]

    max_completed_points = 0
    raw_user_items = []

    for membership in memberships:
        user_tasks = [
            task for task in assigned_tasks
            if task.assignee_id == membership.user_id
        ]

        assigned_tasks_count = len(user_tasks)
        completed_tasks = [task for task in user_tasks if task.is_completed]
        open_tasks = [task for task in user_tasks if not task.is_completed]

        completed_tasks_count = len(completed_tasks)
        open_tasks_count = len(open_tasks)

        total_points = sum(get_points_value(task) for task in user_tasks)
        completed_points = sum(get_points_value(task) for task in completed_tasks)
        remaining_points = sum(get_points_value(task) for task in open_tasks)

        overdue_tasks = [
            task for task in open_tasks
            if task.deadline and task.deadline < today
        ]

        due_soon_tasks = [
            task for task in open_tasks
            if task.deadline and today <= task.deadline <= today + timedelta(days=7)
        ]

        completion_rate = calculate_user_completion_rate(
            completed_tasks_count=completed_tasks_count,
            assigned_tasks_count=assigned_tasks_count,
        )

        max_completed_points = max(max_completed_points, completed_points)

        raw_user_items.append(
            {
                "user": {
                    "id": membership.user_id,
                    "email": membership.user.email,
                    "avatar": membership.user.avatar.url if getattr(membership.user, "avatar", None) else None,
                    "project_role": membership.project_role_id,
                    "project_role_name": membership.project_role.name if membership.project_role else None,
                },
                "assigned_tasks_count": assigned_tasks_count,
                "completed_tasks_count": completed_tasks_count,
                "open_tasks_count": open_tasks_count,
                "completion_rate": completion_rate,
                "total_points": total_points,
                "completed_points": completed_points,
                "remaining_points": remaining_points,
                "overdue_tasks_count": len(overdue_tasks),
                "due_soon_tasks_count": len(due_soon_tasks),
                "overdue_tasks": [
                    serialize_user_metric_task(task)
                    for task in sorted(
                        overdue_tasks,
                        key=lambda item: (item.deadline, item.position, item.id),
                    )[:5]
                ],
                "due_soon_tasks": [
                    serialize_user_metric_task(task)
                    for task in sorted(
                        due_soon_tasks,
                        key=lambda item: (item.deadline, item.position, item.id),
                    )[:5]
                ],
            }
        )

    user_items = []

    for item in raw_user_items:
        item["contribution_score"] = calculate_user_contribution_score(
            completion_rate=item["completion_rate"],
            completed_points=item["completed_points"],
            max_completed_points=max_completed_points,
            overdue_tasks_count=item["overdue_tasks_count"],
            assigned_tasks_count=item["assigned_tasks_count"],
        )

        user_items.append(item)

    total_assigned_tasks = len(assigned_tasks)
    total_completed_tasks = sum(1 for task in assigned_tasks if task.is_completed)
    total_open_tasks = total_assigned_tasks - total_completed_tasks

    total_assigned_points = sum(get_points_value(task) for task in assigned_tasks)
    total_completed_points = sum(
        get_points_value(task)
        for task in assigned_tasks
        if task.is_completed
    )

    total_remaining_points = total_assigned_points - total_completed_points

    return {
        "project": {
            "id": project.id,
            "name": project.name,
        },
        "summary": {
            "members_count": len(memberships),
            "assigned_tasks_count": total_assigned_tasks,
            "completed_tasks_count": total_completed_tasks,
            "open_tasks_count": total_open_tasks,
            "unassigned_tasks_count": len(unassigned_tasks),
            "assigned_points": total_assigned_points,
            "completed_points": total_completed_points,
            "remaining_points": total_remaining_points,
            "completion_rate": calculate_user_completion_rate(
                completed_tasks_count=total_completed_tasks,
                assigned_tasks_count=total_assigned_tasks,
            ),
        },
        "users": sorted(
            user_items,
            key=lambda item: (
                -item["contribution_score"],
                -item["completed_points"],
                -item["completed_tasks_count"],
                item["user"]["email"],
            ),
        ),
        "unassigned_tasks": [
            serialize_user_metric_task(task)
            for task in sorted(
                unassigned_tasks,
                key=lambda item: (item.deadline or today, item.position, item.id),
            )[:8]
        ],
    }