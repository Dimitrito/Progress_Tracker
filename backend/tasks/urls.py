from django.urls import path

from .views import (
    TaskDetailView,
    TaskGroupDetailView,
    TaskGroupsByProjectView,
    TasksByProjectView,
)

urlpatterns = [
    path("projects/<int:project_id>/groups/", TaskGroupsByProjectView.as_view()),
    path("projects/<int:project_id>/tasks/", TasksByProjectView.as_view()),

    path("groups/<int:group_id>/", TaskGroupDetailView.as_view()),
    path("<int:task_id>/", TaskDetailView.as_view()),
]