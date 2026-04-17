from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    Organization,
    OrganizationInvitation,
    OrganizationJoinRequest,
    OrganizationMembership,
)

User = get_user_model()


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "description")


class OrganizationListSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="membership.role", read_only=True)

    class Meta:
        model = Organization
        fields = ("id", "name", "description", "role", "created_at")


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

    class Meta:
        model = OrganizationInvitation
        fields = (
            "id",
            "organization",
            "organization_name",
            "invited_user",
            "invited_user_email",
            "invited_by",
            "invited_by_email",
            "status",
            "created_at",
            "responded_at",
        )