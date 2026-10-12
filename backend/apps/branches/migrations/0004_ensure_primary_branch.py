from django.db import migrations


def ensure_primary(apps, schema_editor):
    """With no primary branch and exactly one active branch, that branch becomes primary. With several active
    branches the choice is left to an administrator."""
    Branch = apps.get_model("branches", "Branch")
    if Branch.objects.filter(is_primary=True).exists():
        return
    active = list(Branch.objects.filter(is_active=True))
    if len(active) == 1:
        active[0].is_primary = True
        active[0].save(update_fields=["is_primary"])


class Migration(migrations.Migration):

    dependencies = [
        ("branches", "0003_branch_profile"),
    ]

    operations = [
        migrations.RunPython(ensure_primary, migrations.RunPython.noop),
    ]
