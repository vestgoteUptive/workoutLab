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

variable "auth_site_url" {
  type = string
}

variable "auth_redirect_urls" {
  type = list(string)
}

variable "google_enabled" {
  type = bool
}

variable "google_client_id" {
  type = string
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

resource "supabase_settings" "this" {
  project_ref = supabase_project.this.id

  auth = jsonencode({
    site_url                  = var.auth_site_url
    uri_allow_list            = join(",", var.auth_redirect_urls)
    external_google_enabled   = var.google_enabled
    external_google_client_id = var.google_client_id
  })
}

output "project_ref" {
  value = supabase_project.this.id
}
