from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from projects.models import Project
from .models import Task, TaskGroup
from .permissions import can_manage_project, has_project_access
from .serializers import (
    TaskCreateSerializer,
    TaskGroupCreateSerializer,
    TaskGroupSerializer,
    TaskSerializer,
    TaskUpdateSerializer,
)


def create_default_groups(project):
    default_groups = [
        ("To do", "todo"),
        ("In progress", "progress"),
        ("Complete", "done"),
    ]

    for index, (name, color) in enumerate(default_groups):
        TaskGroup.objects.get_or_create(
            project=project,
            name=name,
            defaults={
                "color": color,
                "position": index,
            },
        )


class TaskGroupsByProjectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        create_default_groups(project)

        groups = (
            TaskGroup.objects
            .filter(project=project)
            .annotate(task_count=Count("tasks"))
            .order_by("position", "id")
        )

        serializer = TaskGroupSerializer(groups, many=True)
        return Response(serializer.data)

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        serializer = TaskGroupCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "project": project,
            },
        )
        serializer.is_valid(raise_exception=True)
        group = serializer.save()

        response_serializer = TaskGroupSerializer(group)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class TasksByProjectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        tasks = (
            Task.objects
            .filter(group__project=project)
            .select_related("group", "assignee")
            .order_by("position", "id")
        )

        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        serializer = TaskCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "project": project,
            },
        )
        serializer.is_valid(raise_exception=True)
        task = serializer.save()

        response_serializer = TaskSerializer(task)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, task_id):
        task = get_object_or_404(
            Task.objects.select_related("group", "group__project", "assignee"),
            id=task_id,
        )

        serializer = TaskUpdateSerializer(
            task,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        task = serializer.save()

        response_serializer = TaskSerializer(task)
        return Response(response_serializer.data)

    def delete(self, request, task_id):
        task = get_object_or_404(
            Task.objects.select_related("group", "group__project"),
            id=task_id,
        )

        project = task.group.project

        if not can_manage_project(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskGroupDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, group_id):
        group = get_object_or_404(
            TaskGroup.objects.select_related("project"),
            id=group_id,
        )

        if not can_manage_project(request.user, group.project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = TaskGroupSerializer(
            group,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        group = serializer.save()

        return Response(TaskGroupSerializer(group).data)

    def delete(self, request, group_id):
        group = get_object_or_404(
            TaskGroup.objects.select_related("project"),
            id=group_id,
        )

        if not can_manage_project(request.user, group.project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        if group.tasks.exists():
            return Response(
                {"detail": "Cannot delete group with tasks."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)