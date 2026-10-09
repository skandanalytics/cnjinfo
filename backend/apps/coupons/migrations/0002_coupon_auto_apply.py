from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("coupons", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="coupon",
            name="auto_apply",
            field=models.BooleanField(default=False),
        ),
    ]
