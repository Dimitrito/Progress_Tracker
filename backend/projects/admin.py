from django.contrib import admin

from .models import Project, ProjectRole, ProjectMembership, Task


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "organization", "manager", "created_by", "created_at")
    search_fields = ("name", "organization__name", "manager__email")
    list_filter = ("organization", "created_at")


@admin.register(ProjectRole)
class ProjectRoleAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "project")
    search_fields = ("name", "project__name")
    list_filter = ("project",)


@admin.register(ProjectMembership)
class ProjectMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "project", "user", "project_role", "added_at")
    search_fields = ("project__name", "user__email", "project_role__name")
    list_filter = ("project", "project_role")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "project",
        "assignee",
        "status",
        "story_points",
        "deadline",
        "completed_at",
    )
    search_fields = ("title", "project__name", "assignee__email")
    list_filter = ("status", "project")