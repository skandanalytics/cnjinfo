from django.db import migrations, models
import django.db.models.deletion


def seed_views_from_locations(apps, schema_editor):
    DiningTable = apps.get_model("branches", "DiningTable")
    TableView = apps.get_model("branches", "TableView")
    for table in DiningTable.objects.exclude(location="").iterator():
        view, _ = TableView.objects.get_or_create(branch_id=table.branch_id, name=table.location)
        table.table_view_id = view.id
        table.save(update_fields=["table_view"])


class Migration(migrations.Migration):

    dependencies = [
        ("branches", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TableView",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="table_views", to="branches.branch")),
            ],
            options={"db_table": "table_views", "ordering": ["name"]},
        ),
        migrations.AddConstraint(
            model_name="tableview",
            constraint=models.UniqueConstraint(fields=("branch", "name"), name="uq_table_view_branch_name"),
        ),
        migrations.AddField(
            model_name="diningtable",
            name="table_view",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="tables", to="branches.tableview"),
        ),
        migrations.RunPython(seed_views_from_locations, migrations.RunPython.noop),
    ]
