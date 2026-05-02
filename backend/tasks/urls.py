from django.urls import path

from .views import (
    TaskDetailView,
    TaskGroupDetailView,
    TaskGroupsByProjectView,
    TaskSubtasksView,
    TaskTagDetailView,
    TaskTagsByProjectView,
    TasksByProjectView,
)

urlpatterns = [
    path("projects/<int:project_id>/groups/", TaskGroupsByProjectView.as_view()),
    path("projects/<int:project_id>/tasks/", TasksByProjectView.as_view()),
    path("projects/<int:project_id>/tags/", TaskTagsByProjectView.as_view()),

    path("groups/<int:group_id>/", TaskGroupDetailView.as_view()),
    path("tags/<int:tag_id>/", TaskTagDetailView.as_view()),

    path("<int:task_id>/", TaskDetailView.as_view()),
    path("<int:task_id>/subtasks/", TaskSubtasksView.as_view()),
]