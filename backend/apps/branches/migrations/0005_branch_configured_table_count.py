from django.db import migrations, models


def copy_live_table_counts(apps, schema_editor):
    Branch = apps.get_model("branches", "Branch")
    DiningTable = apps.get_model("branches", "DiningTable")
    for branch in Branch.objects.all():
        live = DiningTable.objects.filter(branch_id=branch.id, is_active=True).count()
        if live and not branch.configured_table_count:
            branch.configured_table_count = live
            branch.save(update_fields=["configured_table_count"])


class Migration(migrations.Migration):

    dependencies = [
        ("branches", "0004_ensure_primary_branch"),
    ]

    operations = [
        migrations.AddField(
            model_name="branch",
            name="configured_table_count",
            field=models.PositiveIntegerField(
                default=0,
                help_text="Planned table count. Existing dining tables are never deleted when this changes.",
            ),
        ),
        migrations.RunPython(copy_live_table_counts, migrations.RunPython.noop),
    ]
