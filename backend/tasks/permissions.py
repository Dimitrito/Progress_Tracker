from organizations.models import OrganizationMembership, OrganizationRole
from projects.models import ProjectMembership


def has_project_access(user, project) -> bool:
    return (
        ProjectMembership.objects.filter(project=project, user=user).exists()
        or project.manager_id == user.id
        or OrganizationMembership.objects.filter(
            user=user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()
    )


def can_manage_project(user, project) -> bool:
    return (
        project.manager_id == user.id
        or OrganizationMembership.objects.filter(
            user=user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()
    )