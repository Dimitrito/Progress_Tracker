from .models import Task


def get_task_descendants(task):
    cached_descendants = getattr(task, "_recursive_descendants", None)

    if cached_descendants is not None:
        return cached_descendants

    descendants = []
    frontier_ids = [task.id]

    while frontier_ids:
        children = list(
            Task.objects
            .filter(parent_task_id__in=frontier_ids)
            .select_related("group", "assignee")
            .prefetch_related("tags")
            .order_by("position", "id")
        )

        descendants.extend(children)
        frontier_ids = [child.id for child in children]

    task._recursive_descendants = descendants
    return descendants


def get_task_metrics(task):
    cached_metrics = getattr(task, "_recursive_metrics", None)

    if cached_metrics is not None:
        return cached_metrics

    descendants = get_task_descendants(task)

    own_active_points = 0 if task.is_completed else int(task.story_points or 0)

    descendants_active_points = sum(
        int(item.story_points or 0)
        for item in descendants
        if not item.is_completed
    )

    metrics = {
        "subtasks_count": len(descendants),
        "completed_subtasks_count": sum(
            1 for item in descendants if item.is_completed
        ),
        "active_story_points": own_active_points + descendants_active_points,
    }

    task._recursive_metrics = metrics
    return metrics


def with_task_metrics(queryset):
    return queryset