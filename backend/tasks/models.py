from django.conf import settings
from django.db import models

from projects.models import Project


class TaskPriority(models.TextChoices):
    URGENT = "urgent", "Urgent"
    HIGH = "high", "High"
    NORMAL = "normal", "Normal"
    LOW = "low", "Low"


class TaskGroup(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="task_groups",
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=32, blank=True, default="")
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class TaskTag(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="task_tags",
    )
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=32, blank=True, default="#64748b")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self):
        return f"{self.project.name} - {self.name}"


class Task(models.Model):
    group = models.ForeignKey(
        TaskGroup,
        on_delete=models.CASCADE,
        related_name="tasks",
    )

    parent_task = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subtasks",
    )

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    priority = models.CharField(
        max_length=20,
        choices=TaskPriority.choices,
        null=True,
        blank=True,
    )

    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )

    tags = models.ManyToManyField(
        TaskTag,
        blank=True,
        related_name="tasks",
    )

    story_points = models.PositiveIntegerField(default=1)
    deadline = models.DateField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)

    is_completed = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_tasks",
    )

    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return self.title