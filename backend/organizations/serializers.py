from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    Organization,
    OrganizationInvitation,
    OrganizationJoinRequest,
    OrganizationMembership,
)

User = get_user_model()


class AbsoluteIconUrlMixin:
    def get_icon(self, obj):
        if not obj.icon:
            return None

        request = self.context.get("request")
        url = obj.icon.url

        if request is None:
            return url

        return request.build_absolute_uri(url)

class OrganizationCreateSerializer(AbsoluteIconUrlMixin, serializers.ModelSerializer):
    icon = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Organization
        fields = ("id", "name", "description", "icon")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["icon"] = self.get_icon(instance)
        return data

class OrganizationUpdateSerializer(AbsoluteIconUrlMixin, serializers.ModelSerializer):
    icon = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Organization
        fields = ("id", "name", "description", "icon")
        read_only_fields = ("id",)


class OrganizationListSerializer(AbsoluteIconUrlMixin, serializers.ModelSerializer):
    role = serializers.CharField(source="membership.role", read_only=True)
    icon = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ("id", "name", "description", "icon", "role", "created_at")


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ("id", "user", "user_email", "role", "joined_at")


class OrganizationJoinRequestSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = OrganizationJoinRequest
        fields = (
            "id",
            "organization",
            "organization_name",
            "user",
            "user_email",
            "status",
            "created_at",
            "reviewed_at",
        )
        read_only_fields = (
            "id",
            "user",
            "status",
            "created_at",
            "reviewed_at",
        )


class OrganizationInvitationCreateSerializer(serializers.Serializer):
    invited_user_email = serializers.EmailField()

    def validate_invited_user_email(self, value):
        try:
            User.objects.get(email=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("User with this email does not exist.")
        return value


class OrganizationInvitationSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    invited_user_email = serializers.EmailField(source="invited_user.email", read_only=True)
    invited_by_email = serializers.EmailField(source="invited_by.email", read_only=True)
    organization_description = serializers.CharField(
        source="organization.description",
        read_only=True,
    )

    class Meta:
        model = OrganizationInvitation
        fields = (
            "id",
            "organization",
            "organization_name",
            "organization_description",
            "invited_user",
            "invited_user_email",
            "invited_by",
            "invited_by_email",
            "status",
            "created_at",
            "responded_at",
        )
