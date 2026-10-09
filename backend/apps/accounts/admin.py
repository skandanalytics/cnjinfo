from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Employee, OTPRequest, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("-id",)
    list_display = ("id", "phone", "name", "user_type", "is_active")
    search_fields = ("phone", "name", "email")
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("Profile", {"fields": ("name", "email", "user_type")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("phone", "name", "password1", "password2")}),)


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("employee_code", "user", "branch", "role", "status")
    list_filter = ("role", "status", "branch")
    search_fields = ("employee_code", "user__name", "user__phone")


admin.site.register(OTPRequest)
