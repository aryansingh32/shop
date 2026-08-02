# -*- coding: utf-8 -*-
# Kirana Rebrand — Purchase Simplification Bridge
#
# Automatically installed whenever BOTH kirana_rebrand and purchase are installed.
# Simplifies Odoo's Purchase views for retail shop owners:
#   - Hides dangerous bulk actions (delete, export, import) on Purchase Order lists
#   - Hides procurement-only fields (Incoterms, Fiscal Position, Purchase Rep) on PO form

{
    'name': 'Kirana Rebrand — Purchase Simplification',
    'version': '1.0.0',
    'category': 'Hidden',
    'summary': 'Simplifies Purchase & Reordering views for Kirana shops.',
    'author': 'Kirana Platform',
    'depends': ['kirana_rebrand', 'purchase'],
    'data': [
        'views/purchase_simplify.xml',
    ],
    'auto_install': True,
    'installable': True,
    'license': 'LGPL-3',
}
