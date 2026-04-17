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
    ReceivedJoinRequestsView,
    RejectJoinRequestView,
)

urlpatterns = [
    path("create/", OrganizationCreateView.as_view()),
    path("my/", MyOrganizationsView.as_view()),

    path("<int:organization_id>/join-request/", CreateJoinRequestView.as_view()),
    path("join-requests/received/", ReceivedJoinRequestsView.as_view()),
    path("join-requests/<int:request_id>/approve/", ApproveJoinRequestView.as_view()),
    path("join-requests/<int:request_id>/reject/", RejectJoinRequestView.as_view()),

    path("<int:organization_id>/invite/", CreateInvitationView.as_view()),
    path("invitations/my/", MyInvitationsView.as_view()),
    path("invitations/<int:invitation_id>/accept/", AcceptInvitationView.as_view()),
    path("invitations/<int:invitation_id>/decline/", DeclineInvitationView.as_view()),
]