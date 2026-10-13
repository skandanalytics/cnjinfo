"""Allowlisted Foodie models for the database console. No raw SQL and no system tables."""
from django.apps import apps
from django.db.models.deletion import CASCADE, DO_NOTHING, PROTECT, RESTRICT, SET_DEFAULT, SET_NULL

FOODIE_APPS = {
    "accounts", "branches", "menu", "inventory", "carts",
    "coupons", "orders", "payments", "billing", "audit",
}

# Referencing rows are removed before the row they point at. This covers protected
# relations such as StockTransaction.order, and also cascade or set-null links.
_DELETE_BEFORE_PARENT = {PROTECT, RESTRICT, DO_NOTHING, CASCADE, SET_NULL, SET_DEFAULT}


def is_sensitive(name):
    lowered = (name or "").lower()
    return (
        lowered in {"password", "code_hash"}
        or "password" in lowered
        or "secret" in lowered
        or lowered.endswith("_hash")
        or "token" in lowered
    )


def permitted_models():
    found = []
    for model in apps.get_models():
        meta = model._meta
        if meta.app_label not in FOODIE_APPS or meta.proxy or meta.auto_created:
            continue
        found.append(model)
    found.sort(key=lambda item: item._meta.db_table)
    return found


def model_key(model):
    return f"{model._meta.app_label}.{model.__name__}"


def model_for_key(key):
    wanted = str(key or "")
    for model in permitted_models():
        if model_key(model) == wanted:
            return model
    return None


def deletion_order():
    """Application models with dependents before the records they reference."""
    models = permitted_models()
    index = {model_key(model): model for model in models}
    prerequisites = {key: set() for key in index}
    for model in models:
        child = model_key(model)
        for field in model._meta.concrete_fields:
            if not field.is_relation or not field.many_to_one:
                continue
            remote = field.related_model
            if remote is None:
                continue
            parent = model_key(remote)
            if parent not in index or parent == child:
                continue
            if field.remote_field.on_delete in _DELETE_BEFORE_PARENT:
                prerequisites[parent].add(child)
    pending = {key: set(deps) for key, deps in prerequisites.items()}
    ready = sorted(key for key, deps in pending.items() if not deps)
    ordered = []
    while ready:
        key = ready.pop(0)
        ordered.append(key)
        for parent, deps in pending.items():
            if key in deps:
                deps.remove(key)
                if not deps and parent not in ordered and parent not in ready:
                    ready.append(parent)
        ready.sort()
    if len(ordered) != len(index):
        stuck = ", ".join(key for key in index if key not in ordered)
        raise ValueError(f"Related records could not be ordered for deletion ({stuck}).")
    return [index[key] for key in ordered]
