from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ("id", "email", "password", "first_name", "last_name", "avatar")

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        return user


class UserMeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "avatar",
            "is_active",
            "date_joined",
        )


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    remove_avatar = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "avatar",
            "remove_avatar",
        )
        read_only_fields = ("id", "email", "full_name")

    def update(self, instance, validated_data):
        remove_avatar = validated_data.pop("remove_avatar", False)

        if remove_avatar and instance.avatar:
            instance.avatar.delete(save=False)
            instance.avatar = None

        return super().update(instance, validated_data)