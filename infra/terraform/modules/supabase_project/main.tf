terraform {
  required_providers {
    supabase = {
      source = "supabase/supabase"
    }
  }
}

variable "organization_id" {
  type = string
}

variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "database_password" {
  type      = string
  sensitive = true
}

resource "supabase_project" "this" {
  organization_id   = var.organization_id
  name              = var.name
  region            = var.region
  database_password = var.database_password

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [database_password]
  }
}

output "project_ref" {
  value = supabase_project.this.id
}
