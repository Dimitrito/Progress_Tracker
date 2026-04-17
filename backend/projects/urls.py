from django.urls import path

from .views import (
    AddProjectMemberView,
    MyProjectsView,
    ProjectCreateView,
    ProjectMembersView,
    ProjectRoleCreateView,
    ProjectRolesByProjectView,
    TaskCreateView,
    TasksByProjectView,
    TaskStatusUpdateView,
    ProjectTaskStatsView,
    ProjectHealthScoreView,
    ProjectUserProgressView,
)

urlpatterns = [
    path("create/", ProjectCreateView.as_view()),
    path("my/", MyProjectsView.as_view()),

    path("roles/create/", ProjectRoleCreateView.as_view()),
    path("<int:project_id>/roles/", ProjectRolesByProjectView.as_view()),

    path("members/add/", AddProjectMemberView.as_view()),
    path("<int:project_id>/members/", ProjectMembersView.as_view()),

    path("tasks/create/", TaskCreateView.as_view()),
    path("<int:project_id>/tasks/", TasksByProjectView.as_view()),
    path("tasks/<int:pk>/status/", TaskStatusUpdateView.as_view()),

    path("<int:project_id>/metrics/task-stats/", ProjectTaskStatsView.as_view()),
    path("<int:project_id>/metrics/health/", ProjectHealthScoreView.as_view()),
    path("<int:project_id>/metrics/user-progress/", ProjectUserProgressView.as_view()),
]