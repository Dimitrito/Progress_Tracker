from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from datetime import timedelta
from django.utils import timezone
from .metrics import build_project_metrics
from projects.models import Project

from .functions import with_task_metrics
from .models import Task, TaskGroup, TaskTag
from .permissions import can_manage_project, has_project_access
from .serializers import (
    TaskCreateSerializer,
    TaskDetailSerializer,
    TaskGroupCreateSerializer,
    TaskGroupSerializer,
    TaskSerializer,
    TaskSubtaskCreateSerializer,
    TaskSubtaskSerializer,
    TaskTagCreateSerializer,
    TaskTagSerializer,
    TaskUpdateSerializer,
)

class MyTasksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tasks = (
            with_task_metrics(
                Task.objects
                .filter(assignee=request.user)
                .select_related("group", "group__project", "assignee")
                .prefetch_related("tags")
            )
            .order_by("is_completed", "deadline", "position", "id")
        )

        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)


class ProjectMetricsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        data = build_project_metrics(project)
        return Response(data)


class TaskGroupsByProjectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        groups = (
            TaskGroup.objects
            .filter(project=project)
            .annotate(task_count=Count("tasks", filter=Q(tasks__parent_task__isnull=True)))
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


class TaskTagsByProjectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        tags = TaskTag.objects.filter(project=project).order_by("name", "id")
        serializer = TaskTagSerializer(tags, many=True)
        return Response(serializer.data)

    def post(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        serializer = TaskTagCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "project": project,
            },
        )
        serializer.is_valid(raise_exception=True)
        tag = serializer.save()

        response_serializer = TaskTagSerializer(tag)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class TaskTagDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, tag_id):
        tag = get_object_or_404(
            TaskTag.objects.select_related("project"),
            id=tag_id,
        )

        if not has_project_access(request.user, tag.project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = TaskTagSerializer(
            tag,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        tag = serializer.save()

        return Response(TaskTagSerializer(tag).data)

    def delete(self, request, tag_id):
        tag = get_object_or_404(
            TaskTag.objects.select_related("project"),
            id=tag_id,
        )

        if not has_project_access(request.user, tag.project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        tag.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TasksByProjectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        tasks = (
            with_task_metrics(
                Task.objects
                .filter(group__project=project, parent_task__isnull=True)
                .select_related("group", "assignee")
                .prefetch_related("tags")
            )
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

        task = with_task_metrics(
            Task.objects
            .select_related("group", "assignee")
            .prefetch_related("tags")
        ).get(id=task.id)

        response_serializer = TaskSerializer(task)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_task(self, task_id):
        return get_object_or_404(
            with_task_metrics(
                Task.objects
                .select_related("group", "group__project", "assignee")
                .prefetch_related("tags")
            ),
            id=task_id,
        )

    def get(self, request, task_id):
        task = self.get_task(task_id)
        project = task.group.project

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = TaskDetailSerializer(task)
        return Response(serializer.data)

    def patch(self, request, task_id):
        task = self.get_task(task_id)

        serializer = TaskUpdateSerializer(
            task,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        task = serializer.save()

        task = self.get_task(task.id)

        response_serializer = TaskDetailSerializer(task)
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


class TaskSubtasksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_parent_task(self, task_id):
        return get_object_or_404(
            Task.objects.select_related("group", "group__project"),
            id=task_id,
        )

    def get(self, request, task_id):
        parent_task = self.get_parent_task(task_id)
        project = parent_task.group.project

        if not has_project_access(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        subtasks = (
            parent_task.subtasks
            .select_related("group", "assignee")
            .prefetch_related("tags")
            .order_by("position", "id")
        )

        serializer = TaskSubtaskSerializer(subtasks, many=True)
        return Response(serializer.data)

    def post(self, request, task_id):
        parent_task = self.get_parent_task(task_id)

        serializer = TaskSubtaskCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "parent_task": parent_task,
            },
        )
        serializer.is_valid(raise_exception=True)
        subtask = serializer.save()

        subtask = with_task_metrics(
            Task.objects
            .select_related("group", "assignee")
            .prefetch_related("tags")
        ).get(id=subtask.id)

        response_serializer = TaskSubtaskSerializer(subtask)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)