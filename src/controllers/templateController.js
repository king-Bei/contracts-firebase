const contractTemplateModel = require('../models/contractTemplateModel');

const listTemplates = async (req, res) => {
    try {
        const templates = await contractTemplateModel.findAll();
        res.render('manage-templates', {
            title: '管理合約範本',
            templates: templates
        });
    } catch (error) {
        console.error('Failed to load template management page:', error);
        res.status(500).send('無法載入範本管理頁面');
    }
};

const newTemplatePage = async (req, res) => {
    res.render('new-template', { title: '建立新合約範本' });
};

const createTemplate = async (req, res) => {
    try {
        const { name, content } = req.body;
        const variables = req.body.variables ? JSON.parse(req.body.variables) : [];

        await contractTemplateModel.create({
            name,
            content,
            variables,
            logo_url: req.body.logo_url?.trim() || null,
            requires_approval: req.body.requires_approval === 'on'
        });
        res.redirect('/admin/templates');
    } catch (error) {
        console.error('Failed to create template:', error);
        res.status(500).send('無法建立範本');
    }
};

const editTemplatePage = async (req, res) => {
    try {
        const template = await contractTemplateModel.findById(req.params.id);
        if (!template) {
            return res.status(404).send('找不到範本');
        }

        res.render('edit-template', {
            title: '編輯合約範本',
            template,
            variables: Array.isArray(template.variables) ? template.variables : JSON.parse(template.variables || '[]'),
        });
    } catch (error) {
        console.error('Failed to load template edit page:', error);
        res.status(500).send('無法載入範本編輯頁面');
    }
};

const updateTemplate = async (req, res) => {
    try {
        const template = await contractTemplateModel.findById(req.params.id);
        if (!template) {
            return res.status(404).send('找不到範本');
        }

        const variables = req.body.variables ? JSON.parse(req.body.variables) : [];

        await contractTemplateModel.update(req.params.id, {
            name: req.body.name,
            content: req.body.content,
            variables,
            is_active: req.body.is_active === 'on',
            logo_url: req.body.logo_url?.trim() || null,
            requires_approval: req.body.requires_approval === 'on'
        });

        res.redirect('/admin/templates');
    } catch (error) {
        console.error('Failed to update template:', error);
        res.status(500).send('無法更新範本');
    }
};

const toggleTemplate = async (req, res) => {
    try {
        const template = await contractTemplateModel.findById(req.params.id);
        if (!template) {
            return res.status(404).send('找不到範本');
        }

        await contractTemplateModel.setActive(req.params.id, !template.is_active);
        res.redirect('/admin/templates');
    } catch (error) {
        console.error('Failed to toggle template:', error);
        res.status(500).send('無法更新範本狀態');
    }
};

module.exports = {
    listTemplates,
    newTemplatePage,
    createTemplate,
    editTemplatePage,
    updateTemplate,
    toggleTemplate,
};
