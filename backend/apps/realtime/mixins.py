from .publish import publish_catalog_event


class CatalogBroadcastMixin:
    """After a successful create/update, notify authorized staff that this branch's catalog changed."""

    catalog_resource = "menu"

    def _catalog_branch_id(self, obj):
        if obj is None:
            return None
        if getattr(obj, "branch_id", None):
            return obj.branch_id
        food = getattr(obj, "food", None)
        return getattr(food, "branch_id", None)

    def _broadcast_catalog(self, obj, action="updated"):
        branch_id = self._catalog_branch_id(obj)
        if branch_id:
            publish_catalog_event(branch_id, self.catalog_resource, action)

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._broadcast_catalog(serializer.instance, "created")

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._broadcast_catalog(serializer.instance, "updated")

    def perform_destroy(self, instance):
        branch_id = self._catalog_branch_id(instance)
        super().perform_destroy(instance)
        if branch_id:
            publish_catalog_event(branch_id, self.catalog_resource, "deleted")
