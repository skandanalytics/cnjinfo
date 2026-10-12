from decimal import Decimal

import django.core.validators
from django.db import migrations, models


def set_default_gst_and_settings(apps, schema_editor):
    Branch = apps.get_model("branches", "Branch")
    RestaurantSetting = apps.get_model("branches", "RestaurantSetting")
    Branch.objects.filter(gst_rate=Decimal("0")).update(gst_rate=Decimal("5.00"))
    RestaurantSetting.objects.get_or_create(pk=1, defaults={"qr_enabled": True})


class Migration(migrations.Migration):

    dependencies = [
        ("branches", "0005_branch_configured_table_count"),
    ]

    operations = [
        migrations.CreateModel(
            name="RestaurantSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("qr_enabled", models.BooleanField(default=True)),
            ],
            options={"db_table": "restaurant_settings"},
        ),
        migrations.AlterField(
            model_name="branch",
            name="gst_rate",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("5"),
                help_text="GST percent on the taxable amount.",
                max_digits=5,
                validators=[django.core.validators.MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.RunPython(set_default_gst_and_settings, migrations.RunPython.noop),
    ]
