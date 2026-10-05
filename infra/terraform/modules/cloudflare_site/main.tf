# One Pages project + its custom domain + the CNAME to <project>.pages.dev (D-0010).
# Direct-upload project: no `source`, no build_config (T-0402 deploys with wrangler).
terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
}

variable "account_id" {
  type = string
}

variable "zone_id" {
  type = string
}

variable "project_name" {
  type = string
}

variable "hostname" {
  type = string
}

resource "cloudflare_pages_project" "this" {
  account_id        = var.account_id
  name              = var.project_name
  production_branch = "main"
}

resource "cloudflare_pages_domain" "this" {
  account_id   = var.account_id
  project_name = cloudflare_pages_project.this.name
  name         = var.hostname
}

resource "cloudflare_dns_record" "this" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "CNAME"
  content = "${cloudflare_pages_project.this.name}.pages.dev"
  proxied = true
  ttl     = 1
}
