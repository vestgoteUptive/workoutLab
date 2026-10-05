terraform {
  required_version = "= 1.16.5"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "= 1.11.0"
    }
  }
}

# Token comes from the SUPABASE_ACCESS_TOKEN environment variable only.
provider "supabase" {}

variable "supabase_org_id" {
  type        = string
  description = "Supabase organization slug (env SUPABASE_ORG_ID via TF_VAR_supabase_org_id)."
}

variable "prod_database_password_placeholder" {
  type        = string
  default     = "not-managed-by-terraform"
  description = "Plain placeholder text; ignore_changes keeps it from ever being sent."
}

module "prod" {
  source = "../modules/supabase_project"

  organization_id   = var.supabase_org_id
  name              = "workoutLab"
  region            = "eu-west-1"
  database_password = var.prod_database_password_placeholder
}

import {
  to = module.prod.supabase_project.this
  id = "csgjsdwuxqtuqpuazzpz"
}
