from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from .metrics import (
    get_project_health_score,
    get_project_task_stats,
    get_progress_per_user,
)
from django.db.models import Q
from organizations.models import OrganizationMembership, OrganizationRole
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
    ProjectUpdateSerializer,
)
from rest_framework import status

class ProjectCreateView(generics.CreateAPIView):
    serializer_class = ProjectCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = serializer.save()

        response_serializer = ProjectListSerializer(project)
        return Response(response_serializer.data, status=201)


class MyProjectsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        organization_id = request.query_params.get("organization_id")

        projects = Project.objects.filter(
            Q(manager=request.user)
            | Q(created_by=request.user)
            | Q(memberships__user=request.user)
            | Q(
                organization__memberships__user=request.user,
                organization__memberships__role=OrganizationRole.ADMIN,
            )
        )

        if organization_id:
            projects = projects.filter(organization_id=organization_id)

        projects = (
            projects
            .select_related("organization", "manager")
            .distinct()
        )

        serializer = ProjectListSerializer(projects, many=True)
        return Response(serializer.data)


class ProjectDetailUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(
            Project.objects.select_related("organization", "manager"),
            id=project_id,
        )

        has_access = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
        ).exists()

        if not has_access:
            return Response({"detail": "Forbidden."}, status=403)

        serializer = ProjectListSerializer(project)
        return Response(serializer.data)

    def patch(self, request, project_id):
        project = get_object_or_404(
            Project.objects.select_related("organization", "manager"),
            id=project_id,
        )

        serializer = ProjectUpdateSerializer(
            project,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        response_serializer = ProjectListSerializer(project)
        return Response(response_serializer.data)

    def delete(self, request, project_id):
        project = get_object_or_404(Project, id=project_id)

        membership = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        if not membership:
            return Response(status=403)

        project.delete()
        return Response(status=204)


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


class RemoveProjectMemberView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, project_id, membership_id):
        project = get_object_or_404(Project, id=project_id)

        is_admin = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        is_pm = project.manager_id == request.user.id

        if not (is_admin or is_pm):
            return Response({"detail": "Forbidden."}, status=403)

        membership = get_object_or_404(
            ProjectMembership,
            id=membership_id,
            project=project,
        )

        if membership.user_id == project.manager_id:
            return Response(
                {"detail": "Project manager cannot be removed from project members."},
                status=400,
            )

        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)