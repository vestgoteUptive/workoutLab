# Cloudflare Pages projects and custom domains for workout.vestgote.com (T-0401, D-0010).
# Only three resource types, only two hostnames. Local state; the token comes from the
# CLOUDFLARE_API_TOKEN environment variable.
terraform {
  required_version = "= 1.16.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.27.0"
    }
  }
}

provider "cloudflare" {}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

module "app" {
  source       = "../modules/cloudflare_site"
  account_id   = var.cloudflare_account_id
  zone_id      = var.cloudflare_zone_id
  project_name = "workoutlab-web"
  hostname     = "app.workout.vestgote.com"
}

module "landing" {
  source       = "../modules/cloudflare_site"
  account_id   = var.cloudflare_account_id
  zone_id      = var.cloudflare_zone_id
  project_name = "workoutlab-landing"
  hostname     = "workout.vestgote.com"
}
