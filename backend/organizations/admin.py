from django.contrib import admin

from .models import (
    Organization,
    OrganizationInvitation,
    OrganizationJoinRequest,
    OrganizationMembership,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_by", "invite_code", "created_at")
    search_fields = ("name", "created_by__email")


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "user", "role", "joined_at")
    search_fields = ("organization__name", "user__email")
    list_filter = ("role", "organization")


@admin.register(OrganizationJoinRequest)
class OrganizationJoinRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "user", "status", "created_at", "reviewed_at")
    search_fields = ("organization__name", "user__email")
    list_filter = ("status", "organization")


@admin.register(OrganizationInvitation)
class OrganizationInvitationAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "invited_user", "invited_by", "status", "created_at")
    search_fields = ("organization__name", "invited_user__email", "invited_by__email")
    list_filter = ("status", "organization")