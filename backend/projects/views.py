from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from .metrics import (
    get_project_health_score,
    get_project_task_stats,
    get_progress_per_user,
)
from organizations.models import OrganizationMembership
from .models import Project, ProjectMembership, ProjectRole, Task
from .serializers import (
    ProjectCreateSerializer,
    ProjectListSerializer,
    ProjectMembershipCreateSerializer,
    ProjectMembershipSerializer,
    ProjectRoleCreateSerializer,
    ProjectRoleListSerializer,
    TaskCreateSerializer,
    TaskListSerializer,
    TaskStatusUpdateSerializer,
)


class ProjectCreateView(generics.CreateAPIView):
    serializer_class = ProjectCreateSerializer
    permission_classes = [permissions.IsAuthenticated]


class MyProjectsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        project_ids = ProjectMembership.objects.filter(
            user=request.user
        ).values_list("project_id", flat=True)

        org_ids = OrganizationMembership.objects.filter(
            user=request.user
        ).values_list("organization_id", flat=True)

        projects = Project.objects.filter(
            id__in=project_ids
        ) | Project.objects.filter(
            organization_id__in=org_ids,
            manager=request.user,
        )

        projects = projects.select_related("organization", "manager").distinct()

        serializer = ProjectListSerializer(projects, many=True)
        return Response(serializer.data)


class ProjectRoleCreateView(generics.CreateAPIView):
    serializer_class = ProjectRoleCreateSerializer
    permission_classes = [permissions.IsAuthenticated]


class ProjectRolesByProjectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        has_access = (
            ProjectMembership.objects.filter(project=project, user=request.user).exists()
            or project.manager_id == request.user.id
            or OrganizationMembership.objects.filter(
                user=request.user,
                organization=project.organization,
            ).exists()
        )

        if not has_access:
            return Response({"detail": "Forbidden."}, status=403)

        roles = ProjectRole.objects.filter(project=project)
        serializer = ProjectRoleListSerializer(roles, many=True)
        return Response(serializer.data)


class AddProjectMemberView(generics.CreateAPIView):
    serializer_class = ProjectMembershipCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        response_serializer = ProjectMembershipSerializer(membership)
        return Response(response_serializer.data, status=201)


class ProjectMembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        has_access = (
            ProjectMembership.objects.filter(project=project, user=request.user).exists()
            or project.manager_id == request.user.id
            or OrganizationMembership.objects.filter(
                user=request.user,
                organization=project.organization,
            ).exists()
        )

        if not has_access:
            return Response({"detail": "Forbidden."}, status=403)

        memberships = ProjectMembership.objects.filter(
            project=project
        ).select_related("user", "project_role")

        serializer = ProjectMembershipSerializer(memberships, many=True)
        return Response(serializer.data)


class TaskCreateView(generics.CreateAPIView):
    serializer_class = TaskCreateSerializer
    permission_classes = [permissions.IsAuthenticated]


class TasksByProjectView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        has_access = (
            ProjectMembership.objects.filter(project=project, user=request.user).exists()
            or project.manager_id == request.user.id
            or OrganizationMembership.objects.filter(
                user=request.user,
                organization=project.organization,
            ).exists()
        )

        if not has_access:
            return Response({"detail": "Forbidden."}, status=403)

        tasks = Task.objects.filter(project=project).select_related("assignee", "project")
        serializer = TaskListSerializer(tasks, many=True)
        return Response(serializer.data)


class TaskStatusUpdateView(generics.UpdateAPIView):
    queryset = Task.objects.select_related("project", "project__organization", "assignee")
    serializer_class = TaskStatusUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["patch"]


class ProjectTaskStatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        has_access = (
            ProjectMembership.objects.filter(project=project, user=request.user).exists()
            or project.manager_id == request.user.id
            or OrganizationMembership.objects.filter(
                user=request.user,
                organization=project.organization,
            ).exists()
        )

        if not has_access:
            return Response({"detail": "Forbidden."}, status=403)

        stats = get_project_task_stats(project)
        return Response(stats)


class ProjectHealthScoreView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        has_access = (
            ProjectMembership.objects.filter(project=project, user=request.user).exists()
            or project.manager_id == request.user.id
            or OrganizationMembership.objects.filter(
                user=request.user,
                organization=project.organization,
            ).exists()
        )

        if not has_access:
            return Response({"detail": "Forbidden."}, status=403)

        data = get_project_health_score(project)
        return Response(data)


class ProjectUserProgressView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        has_access = (
            ProjectMembership.objects.filter(project=project, user=request.user).exists()
            or project.manager_id == request.user.id
            or OrganizationMembership.objects.filter(
                user=request.user,
                organization=project.organization,
            ).exists()
        )

        if not has_access:
            return Response({"detail": "Forbidden."}, status=403)

        data = get_progress_per_user(project)
        return Response(data)