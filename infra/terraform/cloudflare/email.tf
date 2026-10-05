# Resend sending-domain records for workout.vestgote.com (T-0404a, D-0012, gate 4).
# Layout as Resend shows it (H-20, region eu-west-1): two CNAMEs for sending plus the DKIM TXT,
# and DMARC p=none under workout. (never the apex _dmarc.vestgote.com). All DNS only.
# The first three already existed (created outside Terraform on 2026-10-05) with the same
# content, so they are adopted with import blocks and mirror the stored values (TTL 3600, TXT
# content quoted the way Cloudflare stores it) so the import is a no-op (D-0187).

import {
  to = cloudflare_dns_record.resend_send
  id = "${var.cloudflare_zone_id}/9dcf42e71b9672b45b455c664be9c3ac"
}

import {
  to = cloudflare_dns_record.resend_rsend
  id = "${var.cloudflare_zone_id}/8676a02f75b610d0c4e82666aaccc13e"
}

import {
  to = cloudflare_dns_record.resend_dkim
  id = "${var.cloudflare_zone_id}/428f3ef44164f7725b6cd0310fae2f0b"
}

resource "cloudflare_dns_record" "resend_send" {
  zone_id = var.cloudflare_zone_id
  name    = "send.workout.vestgote.com"
  type    = "CNAME"
  content = "send.forge.rmta.net"
  proxied = false
  ttl     = 3600
}

resource "cloudflare_dns_record" "resend_rsend" {
  zone_id = var.cloudflare_zone_id
  name    = "rsend.workout.vestgote.com"
  type    = "CNAME"
  content = "rsend-euw1.forge.rmta.net"
  proxied = false
  ttl     = 3600
}

resource "cloudflare_dns_record" "resend_dkim" {
  zone_id = var.cloudflare_zone_id
  name    = "resend._domainkey.workout.vestgote.com"
  type    = "TXT"
  content = "\"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDhGPl45UgyJOGUVSp76YLZQ6fFwMkEUuo5P1j5Czqr179a+nxf13qAwOdlRr1XQ58xvVfKLgXiAE/WR8wHyFElNGU3SytI8Luutg7/H8T+hwFf9cL4smm9Rj3suEwrDKiUQTe9fcl3D9maU4RsBx2BVnvTyRPVitDrSze9+yho7wIDAQAB\""
  proxied = false
  ttl     = 3600
}

resource "cloudflare_dns_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.workout.vestgote.com"
  type    = "TXT"
  content = "\"v=DMARC1; p=none;\""
  proxied = false
  ttl     = 3600
}
