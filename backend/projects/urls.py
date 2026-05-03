from django.urls import path

from .views import (
    AddProjectMemberView,
    MyProjectsView,
    ProjectCreateView,
    ProjectDetailUpdateView,
    ProjectMemberDetailView,
    ProjectMembersView,
    ProjectRoleCreateView,
    ProjectRoleDetailView,
    ProjectRolesByProjectView,
    RemoveProjectMemberView,
)
urlpatterns = [
    path("create/", ProjectCreateView.as_view()),
    path("my/", MyProjectsView.as_view()),

    path("roles/create/", ProjectRoleCreateView.as_view()),
    path("roles/<int:role_id>/", ProjectRoleDetailView.as_view()),
    path("<int:project_id>/roles/", ProjectRolesByProjectView.as_view()),

    path("members/add/", AddProjectMemberView.as_view()),
    path("<int:project_id>/members/", ProjectMembersView.as_view()),
    path("<int:project_id>/members/<int:membership_id>/", ProjectMemberDetailView.as_view()),
    path("<int:project_id>/members/<int:membership_id>/remove/", RemoveProjectMemberView.as_view()),

    path("<int:project_id>/", ProjectDetailUpdateView.as_view()),
]