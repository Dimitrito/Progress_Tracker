from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser

from .models import (
    InvitationStatus,
    Organization,
    OrganizationInvitation,
    OrganizationJoinRequest,
    OrganizationMembership,
    OrganizationRole,
    RequestStatus,
)
from .serializers import (
    OrganizationCreateSerializer,
    OrganizationInvitationCreateSerializer,
    OrganizationInvitationSerializer,
    OrganizationJoinRequestSerializer,
    OrganizationListSerializer,
    OrganizationMembershipSerializer,
    OrganizationUpdateSerializer,
)

User = get_user_model()


def get_user_organization_membership(user, organization):
    return OrganizationMembership.objects.filter(
        user=user,
        organization=organization,
    ).first()


def is_organization_admin(user, organization):
    membership = get_user_organization_membership(user, organization)
    return membership and membership.role == OrganizationRole.ADMIN


class OrganizationCreateView(generics.CreateAPIView):
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = OrganizationCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        organization = serializer.save(created_by=self.request.user)
        OrganizationMembership.objects.create(
            user=self.request.user,
            organization=organization,
            role=OrganizationRole.ADMIN,
        )


class MyOrganizationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        memberships = OrganizationMembership.objects.filter(
            user=request.user
        ).select_related("organization")

        organizations = []
        for membership in memberships:
            organization = membership.organization
            organization.membership = membership
            organizations.append(organization)

        serializer = OrganizationListSerializer(
            organizations,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data)


class OrganizationDetailUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, organization_id):
        return self._update(request, organization_id, partial=True)

    def put(self, request, organization_id):
        return self._update(request, organization_id, partial=False)

    def _update(self, request, organization_id, partial):
        organization = get_object_or_404(Organization, id=organization_id)
        membership = get_user_organization_membership(request.user, organization)

        if not membership:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        if membership.role != OrganizationRole.ADMIN:
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = OrganizationUpdateSerializer(
            organization,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        organization.membership = membership
        response_serializer = OrganizationListSerializer(
            organization,
            context={"request": request},
        )
        return Response(response_serializer.data)


class OrganizationMembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id)
        if not get_user_organization_membership(request.user, organization):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        memberships = (
            OrganizationMembership.objects.filter(organization=organization)
            .select_related("user")
            .order_by("role", "joined_at")
        )
        serializer = OrganizationMembershipSerializer(memberships, many=True)
        return Response(serializer.data)


class OrganizationPendingInvitationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id)
        if not is_organization_admin(request.user, organization):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        invitations = OrganizationInvitation.objects.filter(
            organization=organization,
            status=InvitationStatus.PENDING,
        ).select_related("invited_user", "invited_by")

        serializer = OrganizationInvitationSerializer(invitations, many=True)
        return Response(serializer.data)


class CreateJoinRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id)

        if OrganizationMembership.objects.filter(
            user=request.user,
            organization=organization,
        ).exists():
            return Response(
                {"detail": "You are already a member of this organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        join_request, created = OrganizationJoinRequest.objects.get_or_create(
            user=request.user,
            organization=organization,
            defaults={"status": RequestStatus.PENDING},
        )

        if not created:
            if join_request.status == RequestStatus.PENDING:
                return Response(
                    {"detail": "Join request already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            join_request.status = RequestStatus.PENDING
            join_request.reviewed_at = None
            join_request.save()

        serializer = OrganizationJoinRequestSerializer(join_request)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ReceivedJoinRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        admin_organization_ids = OrganizationMembership.objects.filter(
            user=request.user,
            role=OrganizationRole.ADMIN,
        ).values_list("organization_id", flat=True)

        join_requests = OrganizationJoinRequest.objects.filter(
            organization_id__in=admin_organization_ids,
            status=RequestStatus.PENDING,
        ).select_related("user", "organization")

        serializer = OrganizationJoinRequestSerializer(join_requests, many=True)
        return Response(serializer.data)


class ApproveJoinRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, request_id):
        join_request = get_object_or_404(
            OrganizationJoinRequest.objects.select_related("organization", "user"),
            id=request_id,
        )

        if not is_organization_admin(request.user, join_request.organization):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        if join_request.status != RequestStatus.PENDING:
            return Response(
                {"detail": "This request is already processed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        OrganizationMembership.objects.get_or_create(
            user=join_request.user,
            organization=join_request.organization,
            defaults={"role": OrganizationRole.MEMBER},
        )

        join_request.status = RequestStatus.APPROVED
        join_request.reviewed_at = timezone.now()
        join_request.save()

        serializer = OrganizationJoinRequestSerializer(join_request)
        return Response(serializer.data)


class RejectJoinRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, request_id):
        join_request = get_object_or_404(
            OrganizationJoinRequest.objects.select_related("organization"),
            id=request_id,
        )

        if not is_organization_admin(request.user, join_request.organization):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        if join_request.status != RequestStatus.PENDING:
            return Response(
                {"detail": "This request is already processed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        join_request.status = RequestStatus.REJECTED
        join_request.reviewed_at = timezone.now()
        join_request.save()

        serializer = OrganizationJoinRequestSerializer(join_request)
        return Response(serializer.data)


class CreateInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, organization_id):
        organization = get_object_or_404(Organization, id=organization_id)

        if not is_organization_admin(request.user, organization):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

        serializer = OrganizationInvitationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        invited_user = User.objects.get(email=serializer.validated_data["invited_user_email"])

        if OrganizationMembership.objects.filter(
            user=invited_user,
            organization=organization,
        ).exists():
            return Response(
                {"detail": "User is already a member of this organization."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation, created = OrganizationInvitation.objects.get_or_create(
            organization=organization,
            invited_user=invited_user,
            defaults={
                "invited_by": request.user,
                "status": InvitationStatus.PENDING,
            },
        )

        if not created:
            if invitation.status == InvitationStatus.PENDING:
                return Response(
                    {"detail": "Invitation already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invitation.invited_by = request.user
            invitation.status = InvitationStatus.PENDING
            invitation.responded_at = None
            invitation.save()

        response_serializer = OrganizationInvitationSerializer(invitation)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class MyInvitationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        invitations = OrganizationInvitation.objects.filter(
            invited_user=request.user,
            status=InvitationStatus.PENDING,
        ).select_related("organization", "invited_by", "invited_user")

        serializer = OrganizationInvitationSerializer(invitations, many=True)
        return Response(serializer.data)


class AcceptInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, invitation_id):
        invitation = get_object_or_404(
            OrganizationInvitation.objects.select_related("organization", "invited_user"),
            id=invitation_id,
            invited_user=request.user,
        )

        if invitation.status != InvitationStatus.PENDING:
            return Response(
                {"detail": "This invitation is already processed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        OrganizationMembership.objects.get_or_create(
            user=request.user,
            organization=invitation.organization,
            defaults={"role": OrganizationRole.MEMBER},
        )

        invitation.status = InvitationStatus.ACCEPTED
        invitation.responded_at = timezone.now()
        invitation.save()

        serializer = OrganizationInvitationSerializer(invitation)
        return Response(serializer.data)


class DeclineInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, invitation_id):
        invitation = get_object_or_404(
            OrganizationInvitation.objects.select_related("organization"),
            id=invitation_id,
            invited_user=request.user,
        )

        if invitation.status != InvitationStatus.PENDING:
            return Response(
                {"detail": "This invitation is already processed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invitation.status = InvitationStatus.DECLINED
        invitation.responded_at = timezone.now()
        invitation.save()

        serializer = OrganizationInvitationSerializer(invitation)
        return Response(serializer.data)
