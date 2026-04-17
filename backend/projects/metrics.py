from django.db import models
from django.db.models import Sum
from django.utils import timezone

from .models import Project, ProjectMembership, Task, TaskStatus


def get_project_task_stats(project: Project):
    today = timezone.localdate()

    tasks = Task.objects.filter(project=project)

    total = tasks.count()
    todo = tasks.filter(status=TaskStatus.TODO).count()
    in_progress = tasks.filter(status=TaskStatus.IN_PROGRESS).count()
    done = tasks.filter(status=TaskStatus.DONE).count()

    overdue_active = tasks.filter(
        deadline__lt=today
    ).exclude(status=TaskStatus.DONE).count()

    return {
        "total": total,
        "todo": todo,
        "in_progress": in_progress,
        "done": done,
        "overdue_active": overdue_active,
    }


def get_project_health_score(project: Project):
    stats = get_project_task_stats(project)

    total = stats["total"]
    done = stats["done"]
    overdue_active = stats["overdue_active"]
    todo = stats["todo"]
    in_progress = stats["in_progress"]

    if total == 0:
        score = 100
    else:
        done_ratio = done / total
        overdue_ratio = overdue_active / total
        unfinished_ratio = (todo + in_progress) / total

        score = 100
        score -= overdue_ratio * 50
        score -= unfinished_ratio * 20
        score += done_ratio * 20

        if score > 100:
            score = 100
        if score < 0:
            score = 0

        score = round(score, 2)

    if score >= 75:
        status = "good"
    elif score >= 45:
        status = "warning"
    else:
        status = "critical"

    return {
        "score": score,
        "status": status,
        "stats": stats,
    }


def get_progress_per_user(project: Project):
    today = timezone.localdate()
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    memberships = ProjectMembership.objects.filter(
        project=project
    ).select_related("user", "project_role")

    result = []

    for membership in memberships:
        user = membership.user
        tasks = Task.objects.filter(project=project, assignee=user)

        assigned_tasks = tasks.count()
        completed_tasks = tasks.filter(status=TaskStatus.DONE).count()

        total_assigned_points = tasks.aggregate(
            total=Sum("story_points")
        )["total"] or 0

        completed_points = tasks.filter(
            status=TaskStatus.DONE
        ).aggregate(total=Sum("story_points"))["total"] or 0

        completed_points_this_month = tasks.filter(
            status=TaskStatus.DONE,
            completed_at__gte=month_start,
        ).aggregate(total=Sum("story_points"))["total"] or 0

        on_time_completed_tasks = tasks.filter(
            status=TaskStatus.DONE,
            deadline__isnull=False,
            completed_at__date__lte=models.F("deadline"),
        ).count()

        overdue_completed_tasks = tasks.filter(
            status=TaskStatus.DONE,
            deadline__isnull=False,
            completed_at__date__gt=models.F("deadline"),
        ).count()

        active_overdue_tasks = tasks.filter(
            deadline__lt=today
        ).exclude(status=TaskStatus.DONE).count()

        result.append({
            "user_id": user.id,
            "email": user.email,
            "full_name": getattr(user, "full_name", user.email),
            "project_role": membership.project_role.name if membership.project_role else None,
            "assigned_tasks": assigned_tasks,
            "completed_tasks": completed_tasks,
            "total_assigned_points": total_assigned_points,
            "completed_points": completed_points,
            "completed_points_this_month": completed_points_this_month,
            "on_time_completed_tasks": on_time_completed_tasks,
            "overdue_completed_tasks": overdue_completed_tasks,
            "active_overdue_tasks": active_overdue_tasks,
        })

    return result