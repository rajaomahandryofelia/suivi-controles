from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "message", "date_envoi", "est_lue"]
        read_only_fields = fields


class NotificationsView(APIView):
    """Les 50 dernières notifications de l'utilisateur connecté."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        base = Notification.objects.filter(destinataire=request.user)
        return Response(
            {
                "non_lues": base.filter(est_lue=False).count(),
                "notifications": NotificationSerializer(base[:50], many=True).data,
            }
        )


class NotificationLueView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notification = get_object_or_404(
            Notification, pk=pk, destinataire=request.user
        )
        notification.est_lue = True
        notification.save(update_fields=["est_lue"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ToutLireView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(destinataire=request.user, est_lue=False).update(
            est_lue=True
        )
        return Response(status=status.HTTP_204_NO_CONTENT)