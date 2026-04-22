from django.urls import path
from .views import (
    AcceptInvitationView,
    ApproveJoinRequestView,
    CreateInvitationView,
    CreateJoinRequestView,
    DeclineInvitationView,
    MyInvitationsView,
    MyOrganizationsView,
    OrganizationCreateView,
    OrganizationDetailUpdateView,
    OrganizationMembersView,
    OrganizationPendingInvitationsView,
    ReceivedJoinRequestsView,
    RejectJoinRequestView, LeaveOrganizationView, DeleteOrganizationView, RemoveOrganizationMemberView,
    CancelInvitationView,
)

urlpatterns = [
    path("create/", OrganizationCreateView.as_view()),
    path("my/", MyOrganizationsView.as_view()),
    path("<int:organization_id>/members/", OrganizationMembersView.as_view()),
    path(
        "<int:organization_id>/invitations/pending/",
        OrganizationPendingInvitationsView.as_view(),
    ),
    path("<int:organization_id>/", OrganizationDetailUpdateView.as_view()),

    path("<int:organization_id>/join-request/", CreateJoinRequestView.as_view()),
    path("join-requests/received/", ReceivedJoinRequestsView.as_view()),
    path("join-requests/<int:request_id>/approve/", ApproveJoinRequestView.as_view()),
    path("join-requests/<int:request_id>/reject/", RejectJoinRequestView.as_view()),

    path("<int:organization_id>/invite/", CreateInvitationView.as_view()),
    path("invitations/my/", MyInvitationsView.as_view()),
    path("invitations/<int:invitation_id>/accept/", AcceptInvitationView.as_view()),
    path("invitations/<int:invitation_id>/decline/", DeclineInvitationView.as_view()),

    path("<int:organization_id>/leave/", LeaveOrganizationView.as_view()),
    path("<int:organization_id>/delete/", DeleteOrganizationView.as_view()),
    path("<int:organization_id>/members/<int:membership_id>/remove/", RemoveOrganizationMemberView.as_view()),
    path("invitations/<int:invitation_id>/cancel/", CancelInvitationView.as_view()),
]
