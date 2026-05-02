from django.utils import timezone
from rest_framework import serializers

from projects.models import ProjectMembership
from .models import Task, TaskGroup, TaskTag
from .permissions import can_manage_project, has_project_access
from .functions import get_task_metrics

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


class TaskTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskTag
        fields = (
            "id",
            "project",
            "name",
            "color",
            "created_at",
        )
        read_only_fields = ("id", "project", "created_at")


class TaskTagCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskTag
        fields = ("name", "color")

    def validate(self, attrs):
        request = self.context["request"]
        project = self.context["project"]

        if not has_project_access(request.user, project):
            raise serializers.ValidationError("You do not have access to this project.")

        attrs["name"] = attrs["name"].strip()

        if not attrs["name"]:
            raise serializers.ValidationError({"name": "Tag name is required."})

        return attrs

    def create(self, validated_data):
        project = self.context["project"]
        return TaskTag.objects.create(project=project, **validated_data)


class TaskSerializer(serializers.ModelSerializer):
    project = serializers.IntegerField(source="group.project_id", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    assignee_email = serializers.EmailField(source="assignee.email", read_only=True)
    assignee_avatar = serializers.ImageField(source="assignee.avatar", read_only=True)
    tags = TaskTagSerializer(many=True, read_only=True)

    subtasks_count = serializers.SerializerMethodField()
    completed_subtasks_count = serializers.SerializerMethodField()
    active_story_points = serializers.SerializerMethodField()

    def get_subtasks_count(self, obj):
        return get_task_metrics(obj)["subtasks_count"]

    def get_completed_subtasks_count(self, obj):
        return get_task_metrics(obj)["completed_subtasks_count"]

    def get_active_story_points(self, obj):
        return get_task_metrics(obj)["active_story_points"]

    class Meta:
        model = Task
        fields = (
            "id",
            "project",
            "group",
            "group_name",
            "parent_task",
            "priority",
            "title",
            "description",
            "assignee",
            "assignee_email",
            "assignee_avatar",
            "tags",
            "story_points",
            "active_story_points",
            "deadline",
            "position",
            "is_completed",
            "completed_at",
            "subtasks_count",
            "completed_subtasks_count",
            "created_at",
        )


class TaskSubtaskSerializer(TaskSerializer):
    subtasks = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + (
            "subtasks",
        )

    def get_subtasks(self, obj):
        subtasks = (
            obj.subtasks
            .select_related("group", "assignee")
            .prefetch_related("tags")
            .order_by("position", "id")
        )

        return TaskSubtaskSerializer(subtasks, many=True).data


class TaskDetailSerializer(TaskSerializer):
    subtasks = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + (
            "subtasks",
        )

    def get_subtasks(self, obj):
        subtasks = (
            obj.subtasks
            .select_related("group", "assignee")
            .prefetch_related("tags")
            .order_by("position", "id")
        )

        return TaskSubtaskSerializer(subtasks, many=True).data


class TaskCreateSerializer(serializers.ModelSerializer):
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Task
        fields = (
            "group",
            "title",
            "description",
            "priority",
            "assignee",
            "tag_ids",
            "story_points",
            "deadline",
            "position",
            "is_completed",
        )

    def validate(self, attrs):
        request = self.context["request"]
        project = self.context["project"]
        group = attrs["group"]
        assignee = attrs.get("assignee")
        tag_ids = attrs.get("tag_ids", [])

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

        if tag_ids:
            valid_count = TaskTag.objects.filter(
                project=project,
                id__in=tag_ids,
            ).count()

            if valid_count != len(set(tag_ids)):
                raise serializers.ValidationError(
                    {"tag_ids": "All tags must belong to this project."}
                )

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        tag_ids = validated_data.pop("tag_ids", [])

        if validated_data.get("is_completed"):
            validated_data["completed_at"] = timezone.now()
        else:
            validated_data["completed_at"] = None

        task = Task.objects.create(
            created_by=request.user,
            **validated_data,
        )

        if tag_ids:
            task.tags.set(TaskTag.objects.filter(id__in=tag_ids))

        return task


class TaskSubtaskCreateSerializer(serializers.ModelSerializer):
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Task
        fields = (
            "title",
            "description",
            "priority",
            "assignee",
            "tag_ids",
            "story_points",
            "deadline",
            "position",
            "is_completed",
        )

    def validate(self, attrs):
        request = self.context["request"]
        parent_task = self.context["parent_task"]
        project = parent_task.group.project

        assignee = attrs.get("assignee")
        tag_ids = attrs.get("tag_ids", [])

        if not has_project_access(request.user, project):
            raise serializers.ValidationError("You do not have access to this project.")

        title = attrs.get("title", "").strip()

        if not title:
            raise serializers.ValidationError({"title": "Task title is required."})

        attrs["title"] = title

        if assignee:
            is_project_member = ProjectMembership.objects.filter(
                project=project,
                user=assignee,
            ).exists()

            if not is_project_member:
                raise serializers.ValidationError(
                    "Assignee must be a project member."
                )

        if tag_ids:
            valid_count = TaskTag.objects.filter(
                project=project,
                id__in=tag_ids,
            ).count()

            if valid_count != len(set(tag_ids)):
                raise serializers.ValidationError(
                    {"tag_ids": "All tags must belong to this project."}
                )

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        parent_task = self.context["parent_task"]
        tag_ids = validated_data.pop("tag_ids", [])

        if validated_data.get("is_completed"):
            validated_data["completed_at"] = timezone.now()
        else:
            validated_data["completed_at"] = None

        subtask = Task.objects.create(
            group=parent_task.group,
            parent_task=parent_task,
            created_by=request.user,
            **validated_data,
        )

        if tag_ids:
            subtask.tags.set(TaskTag.objects.filter(id__in=tag_ids))

        return subtask


class TaskUpdateSerializer(serializers.ModelSerializer):
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
    )

    class Meta:
        model = Task
        fields = (
            "group",
            "title",
            "description",
            "priority",
            "assignee",
            "tag_ids",
            "story_points",
            "deadline",
            "position",
            "is_completed",
        )

    def validate(self, attrs):
        request = self.context["request"]
        task = self.instance
        project = task.group.project
        group = attrs.get("group")
        assignee = attrs.get("assignee")
        tag_ids = attrs.get("tag_ids", None)

        if not has_project_access(request.user, project):
            raise serializers.ValidationError("You do not have access to this project.")

        if task.parent_task_id and group:
            raise serializers.ValidationError(
                {"group": "Subtasks cannot be moved between groups directly."}
            )

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

        if tag_ids is not None:
            valid_count = TaskTag.objects.filter(
                project=project,
                id__in=tag_ids,
            ).count()

            if valid_count != len(set(tag_ids)):
                raise serializers.ValidationError(
                    {"tag_ids": "All tags must belong to this project."}
                )

        return attrs

    def update(self, instance, validated_data):
        tag_ids = validated_data.pop("tag_ids", None)

        if "is_completed" in validated_data:
            next_is_completed = validated_data["is_completed"]

            if next_is_completed and not instance.completed_at:
                validated_data["completed_at"] = timezone.now()

            if not next_is_completed:
                validated_data["completed_at"] = None

        instance = super().update(instance, validated_data)

        if tag_ids is not None:
            instance.tags.set(TaskTag.objects.filter(id__in=tag_ids))

        return instance