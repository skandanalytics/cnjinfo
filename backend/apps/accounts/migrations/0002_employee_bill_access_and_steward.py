from django.db import migrations, models


def rename_waiter_titles(apps, schema_editor):
    Employee = apps.get_model("accounts", "Employee")
    for emp in Employee.objects.all():
        title = (emp.job_title or "").strip()
        if title.lower() in {"waiter", "waiter / dining floor staff"}:
            emp.job_title = "Steward"
            emp.save(update_fields=["job_title"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="bill_access",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.RunPython(rename_waiter_titles, migrations.RunPython.noop),
    ]
