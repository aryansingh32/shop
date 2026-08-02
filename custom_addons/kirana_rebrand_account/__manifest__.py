# -*- coding: utf-8 -*-
# Kirana Rebrand — Accounting Simplification Bridge
#
# Automatically installed whenever BOTH kirana_rebrand and account are installed.
# Simplifies Odoo's Accounting views for retail shop owners:
#   - Hides dangerous bulk actions (delete, export, import) on invoice lists
#   - Hides accountant-only fields (Journal, Fiscal Position, Incoterms, raw ledger tab)
#     on invoice forms

{
    'name': 'Kirana Rebrand — Accounting Simplification',
    'version': '1.0.0',
    'category': 'Hidden',
    'summary': 'Simplifies Accounting & GST views for Kirana shops.',
    'author': 'Kirana Platform',
    'depends': ['kirana_rebrand', 'account'],
    'data': [
        'views/accounting_simplify.xml',
    ],
    'auto_install': True,
    'installable': True,
    'license': 'LGPL-3',
}
