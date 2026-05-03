from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q
from organizations.models import OrganizationMembership, OrganizationRole
from .models import Project, ProjectMembership, ProjectRole
from .serializers import (
    ProjectCreateSerializer,
    ProjectListSerializer,
    ProjectMembershipCreateSerializer,
    ProjectMembershipSerializer,
    ProjectMembershipUpdateSerializer,
    ProjectRoleCreateSerializer,
    ProjectRoleListSerializer,
    ProjectRoleUpdateSerializer,
    ProjectUpdateSerializer,
)
from rest_framework import status

def can_manage_project(request_user, project):
    is_admin = OrganizationMembership.objects.filter(
        user=request_user,
        organization=project.organization,
        role=OrganizationRole.ADMIN,
    ).exists()

    is_pm = project.manager_id == request_user.id

    return is_admin or is_pm


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
            .prefetch_related("memberships__user", "memberships__project_role")
            .distinct()
        )

        serializer = ProjectListSerializer(projects, many=True)
        return Response(serializer.data)


class ProjectDetailUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, project_id):
        project = get_object_or_404(
            Project.objects
            .select_related("organization", "manager")
            .prefetch_related("memberships__user", "memberships__project_role"),
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


class ProjectRoleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, role_id):
        role = get_object_or_404(
            ProjectRole.objects.select_related("project", "project__organization"),
            id=role_id,
        )

        serializer = ProjectRoleUpdateSerializer(
            role,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        response_serializer = ProjectRoleListSerializer(role)
        return Response(response_serializer.data)

    def delete(self, request, role_id):
        role = get_object_or_404(
            ProjectRole.objects.select_related("project", "project__organization"),
            id=role_id,
        )

        if not can_manage_project(request.user, role.project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        role.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


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


class ProjectMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, project_id, membership_id):
        project = get_object_or_404(Project, id=project_id)

        if not can_manage_project(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        membership = get_object_or_404(
            ProjectMembership.objects.select_related("user", "project_role", "project"),
            id=membership_id,
            project=project,
        )

        serializer = ProjectMembershipUpdateSerializer(
            membership,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        response_serializer = ProjectMembershipSerializer(membership)
        return Response(response_serializer.data)


class RemoveProjectMemberView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, project_id, membership_id):
        project = get_object_or_404(Project, id=project_id)

        if not can_manage_project(request.user, project):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

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