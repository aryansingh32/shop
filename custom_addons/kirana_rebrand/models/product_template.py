# -*- coding: utf-8 -*-
"""
Fix: products created from the Stock screen were invisible at checkout.

Odoo's point_of_sale module defaults product.template.available_in_pos to
False. Every shop on this platform is a single-counter retail till where the
Stock screen is the primary place an owner adds a product — they have no
reason to expect a separate, unlabeled "Point of Sale" checkbox gates whether
it can actually be sold. Defaulting it True means "add a product" and
"it's sellable" are the same action, matching what a shop owner assumes.

An owner who genuinely wants a non-sellable product (e.g. raw material for
internal use only) can still uncheck it manually.
"""
from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    available_in_pos = fields.Boolean(default=True)
