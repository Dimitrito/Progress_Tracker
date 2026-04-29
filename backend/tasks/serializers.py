from rest_framework import serializers

from projects.models import ProjectMembership
from .models import Task, TaskGroup
from .permissions import can_manage_project, has_project_access


class TaskGroupSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = TaskGroup
        fields = (
            "id",
            "project",
            "name",
            "color",
            "position",
            "task_count",
            "created_at",
        )
        read_only_fields = ("id", "project", "created_at", "task_count")


class TaskGroupCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskGroup
        fields = ("name", "color", "position")

    def validate(self, attrs):
        request = self.context["request"]
        project = self.context["project"]

        if not can_manage_project(request.user, project):
            raise serializers.ValidationError(
                "Only organization owner or project manager can create task groups."
            )

        return attrs

    def create(self, validated_data):
        project = self.context["project"]
        return TaskGroup.objects.create(project=project, **validated_data)


class TaskSerializer(serializers.ModelSerializer):
    project = serializers.IntegerField(source="group.project_id", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    assignee_email = serializers.EmailField(source="assignee.email", read_only=True)

    class Meta:
        model = Task
        fields = (
            "id",
            "project",
            "group",
            "group_name",
            "title",
            "description",
            "assignee",
            "assignee_email",
            "story_points",
            "deadline",
            "position",
            "completed_at",
            "created_at",
        )
        read_only_fields = (
            "id",
            "project",
            "group_name",
            "assignee_email",
            "completed_at",
            "created_at",
        )


class TaskCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = (
            "group",
            "title",
            "description",
            "assignee",
            "story_points",
            "deadline",
            "position",
        )

    def validate(self, attrs):
        request = self.context["request"]
        project = self.context["project"]
        group = attrs["group"]
        assignee = attrs.get("assignee")

        if group.project_id != project.id:
            raise serializers.ValidationError(
                {"group": "Task group must belong to this project."}
            )

        if not has_project_access(request.user, project):
            raise serializers.ValidationError("You do not have access to this project.")

        if assignee:
            is_project_member = ProjectMembership.objects.filter(
                project=project,
                user=assignee,
            ).exists()

            if not is_project_member:
                raise serializers.ValidationError(
                    "Assignee must be a project member."
                )

        return attrs

    def create(self, validated_data):
        request = self.context["request"]

        return Task.objects.create(
            created_by=request.user,
            **validated_data,
        )


class TaskUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = (
            "group",
            "title",
            "description",
            "assignee",
            "story_points",
            "deadline",
            "position",
            "completed_at",
        )

    def validate(self, attrs):
        request = self.context["request"]
        task = self.instance
        project = task.group.project
        group = attrs.get("group")
        assignee = attrs.get("assignee")

        if not has_project_access(request.user, project):
            raise serializers.ValidationError("You do not have access to this project.")

        if group and group.project_id != project.id:
            raise serializers.ValidationError(
                {"group": "Task group must belong to this project."}
            )

        if assignee:
            is_project_member = ProjectMembership.objects.filter(
                project=project,
                user=assignee,
            ).exists()

            if not is_project_member:
                raise serializers.ValidationError(
                    "Assignee must be a project member."
                )

        return attrs