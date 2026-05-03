from django.contrib.auth import get_user_model
from rest_framework import serializers

from organizations.models import Organization, OrganizationMembership, OrganizationRole
from .models import Project, ProjectMembership, ProjectRole

User = get_user_model()


class ProjectCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = (
            "id",
            "organization",
            "name",
            "description",
            "manager",
            "start_date",
            "end_date",
        )

    def validate(self, attrs):
        organization = attrs["organization"]
        manager = attrs.get("manager")
        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")

        request = self.context["request"]

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": "Project end date cannot be earlier than start date."}
            )

        admin_membership = OrganizationMembership.objects.filter(
            user=request.user,
            organization=organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        if not admin_membership:
            raise serializers.ValidationError("Only organization admin can create a project.")

        if manager:
            manager_membership = OrganizationMembership.objects.filter(
                user=manager,
                organization=organization,
            ).exists()
            if not manager_membership:
                raise serializers.ValidationError("Manager must be a member of this organization.")

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        manager = validated_data.get("manager")

        project = Project.objects.create(
            created_by=request.user,
            **validated_data,
        )

        if manager:
            ProjectMembership.objects.get_or_create(
                project=project,
                user=manager,
            )

        return project


class ProjectListSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    manager_email = serializers.EmailField(source="manager.email", read_only=True)
    team_roles = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "id",
            "name",
            "description",
            "organization",
            "organization_name",
            "manager",
            "manager_email",
            "start_date",
            "end_date",
            "team_roles",
            "created_at",
        )

    def get_team_roles(self, obj):
        memberships = obj.memberships.all()

        return [
            {
                "membership_id": membership.id,
                "user": membership.user_id,
                "user_email": membership.user.email,
                "user_avatar": membership.user.avatar.url if getattr(membership.user, "avatar", None) else None,
                "project_role": membership.project_role_id,
                "project_role_name": membership.project_role.name if membership.project_role else None,
            }
            for membership in memberships
        ]


class ProjectUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = (
            "name",
            "description",
            "manager",
            "start_date",
            "end_date",
        )

    def validate(self, attrs):
        request = self.context["request"]
        project = self.instance
        manager = attrs.get("manager")

        start_date = attrs.get("start_date", project.start_date)
        end_date = attrs.get("end_date", project.end_date)

        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError(
                {"end_date": "Project end date cannot be earlier than start date."}
            )

        is_admin = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        is_pm = project.manager_id == request.user.id

        if not (is_admin or is_pm):
            raise serializers.ValidationError(
                "Only organization admin or project manager can edit this project."
            )

        # PM НЕ может менять project manager
        if is_pm and not is_admin and "manager" in attrs:
            if manager != project.manager:
                raise serializers.ValidationError(
                    "Project manager cannot change project manager."
                )

        if manager:
            manager_membership = OrganizationMembership.objects.filter(
                user=manager,
                organization=project.organization,
            ).exists()

            if not manager_membership:
                raise serializers.ValidationError(
                    "Manager must be a member of this organization."
                )

        return attrs

    def update(self, instance, validated_data):
        project = super().update(instance, validated_data)

        if project.manager:
            ProjectMembership.objects.get_or_create(
                project=project,
                user=project.manager,
            )

        return project

class ProjectRoleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectRole
        fields = ("id", "project", "name")

    def validate(self, attrs):
        project = attrs["project"]
        request = self.context["request"]

        is_admin = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        is_pm = project.manager_id == request.user.id

        if not (is_admin or is_pm):
            raise serializers.ValidationError("Only organization admin or project manager can create project roles.")

        return attrs


class ProjectRoleListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectRole
        fields = ("id", "project", "name")


class ProjectRoleUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectRole
        fields = ("name",)

    def validate_name(self, value):
        name = value.strip()

        if not name:
            raise serializers.ValidationError("Role name is required.")

        return name

    def validate(self, attrs):
        request = self.context["request"]
        role = self.instance
        project = role.project

        is_admin = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        is_pm = project.manager_id == request.user.id

        if not (is_admin or is_pm):
            raise serializers.ValidationError(
                "Only organization admin or project manager can edit project roles."
            )

        name = attrs.get("name")

        if name:
            exists = ProjectRole.objects.filter(
                project=project,
                name__iexact=name,
            ).exclude(id=role.id).exists()

            if exists:
                raise serializers.ValidationError(
                    {"name": "Role with this name already exists in this project."}
                )

        return attrs


class ProjectMembershipCreateSerializer(serializers.Serializer):
    project = serializers.IntegerField()
    user = serializers.IntegerField()
    project_role = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        request = self.context["request"]

        try:
            project = Project.objects.get(id=attrs["project"])
        except Project.DoesNotExist:
            raise serializers.ValidationError({"project": "Project does not exist."})

        try:
            user = User.objects.get(id=attrs["user"])
        except User.DoesNotExist:
            raise serializers.ValidationError({"user": "User does not exist."})

        project_role = None
        if attrs.get("project_role") is not None:
            try:
                project_role = ProjectRole.objects.get(id=attrs["project_role"], project=project)
            except ProjectRole.DoesNotExist:
                raise serializers.ValidationError({"project_role": "Project role does not exist in this project."})

        is_admin = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        is_pm = project.manager_id == request.user.id

        if not (is_admin or is_pm):
            raise serializers.ValidationError("Only organization admin or project manager can add members.")

        org_member = OrganizationMembership.objects.filter(
            user=user,
            organization=project.organization,
        ).exists()

        if not org_member:
            raise serializers.ValidationError({"user": "User must be a member of this organization."})

        attrs["project_obj"] = project
        attrs["user_obj"] = user
        attrs["project_role_obj"] = project_role
        return attrs

    def create(self, validated_data):
        membership, _ = ProjectMembership.objects.get_or_create(
            project=validated_data["project_obj"],
            user=validated_data["user_obj"],
            defaults={"project_role": validated_data["project_role_obj"]},
        )

        if validated_data["project_role_obj"] is not None:
            membership.project_role = validated_data["project_role_obj"]
            membership.save()

        return membership


class ProjectMembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_avatar = serializers.ImageField(source="user.avatar", read_only=True)
    project_role_name = serializers.CharField(source="project_role.name", read_only=True)

    class Meta:
        model = ProjectMembership
        fields = (
            "id",
            "project",
            "user",
            "user_email",
            "user_avatar",
            "project_role",
            "project_role_name",
            "added_at",
        )


class ProjectMembershipUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectMembership
        fields = ("project_role",)

    def validate(self, attrs):
        request = self.context["request"]
        membership = self.instance
        project = membership.project
        project_role = attrs.get("project_role")

        is_admin = OrganizationMembership.objects.filter(
            user=request.user,
            organization=project.organization,
            role=OrganizationRole.ADMIN,
        ).exists()

        is_pm = project.manager_id == request.user.id

        if not (is_admin or is_pm):
            raise serializers.ValidationError(
                "Only organization admin or project manager can update member roles."
            )

        if project_role and project_role.project_id != project.id:
            raise serializers.ValidationError(
                {"project_role": "Project role must belong to this project."}
            )

        return attrs
