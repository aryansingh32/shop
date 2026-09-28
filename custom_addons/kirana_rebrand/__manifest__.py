# -*- coding: utf-8 -*-
# Kirana Rebranding Module
#
# Strips all Odoo branding from the Odoo 18 web client so no Odoo-identifiable
# marks appear when the portal embeds Odoo screens in an iframe.
#
# What it removes / replaces:
#   - Odoo logo from the main menu bar
#   - "Odoo" from the browser page title
#   - Favicon (replaced with a neutral blank)
#   - "Powered by Odoo" text in various footers
#   - Odoo-branded elements from printed reports (invoices, receipts)
#   - References to "Odoo" in system parameters (web.base.url label, etc.)
#
# What it does NOT do:
#   - Modify any Odoo core Python files
#   - Change business functionality
#   - Remove the Odoo session/cookie mechanism
#
# Installed automatically as part of provisionShop() in the platform-command
# integration layer. It must be listed in moduleNames alongside the plan modules.

{
    'name': 'Kirana — Rebranding',
    'version': '1.0.0',
    'category': 'Hidden',
    'summary': 'Removes Odoo branding from the web client and reports.',
    'description': """
        White-label module that strips Odoo's visual identity from the web client
        so it can be embedded in the Kirana shop portal without any Odoo branding
        visible to end users. Brand name and domain are read from ir.config_parameter
        at runtime so they can be changed without code modifications.
    """,
    'author': 'Kirana Platform',
    # barcodes_generator_product is a REAL dependency: data/barcode_rule_data.xml
    # writes barcode.rule.generate_model = 'product.product', a selection value
    # that module adds — the field wouldn't exist without it.
    # stock_picking_product_barcode_report was listed here too but nothing in
    # this module references it; removed — an unmet "depends" entry fails the
    # ENTIRE module (all debranding included) to load on any shop that doesn't
    # have it installed, not just the barcode-label feature. Found live: this
    # exact failure was silently breaking kirana_rebrand (full Odoo branding
    # exposed) on several already-provisioned shops that predate these OCA
    # barcode modules being added to the standard install set.
    'depends': ['web', 'point_of_sale', 'stock', 'barcodes_generator_product'],
    'data': [
        'views/assets.xml',
        'views/pos_simplify.xml',
        'views/pos_partner_quickform.xml',
        'views/products_simplify.xml',
        'views/inventory_simplify.xml',
        'data/ir_config_parameter.xml',
        'data/barcode_rule_data.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'kirana_rebrand/static/src/css/rebrand.css',
            'kirana_rebrand/static/src/js/rebrand.js',
        ],
        # POS frontend bundle — separate from backend, loaded in the live POS session
        'point_of_sale.assets_prod': [
            'kirana_rebrand/static/src/css/rebrand.css',  # branding CSS (debranding + POS simplification)
            'kirana_rebrand/static/src/js/rebrand.js',   # title/favicon/text patcher
            'kirana_rebrand/static/src/js/pos_partner_quickcreate.js',  # one-tap "create customer from search" patch
            'kirana_rebrand/static/src/xml/rebrand.xml', # OWL component overrides (OdooLogo fix, Backend relabel, quick-create button)
        ],
    },
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
