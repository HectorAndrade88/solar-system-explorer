/**
 * @file boot-check.js
 * Script clásico (no módulo) que detecta si la aplicación no pudo arrancar.
 *
 * Los navegadores bloquean los módulos ES cargados desde file:// por la
 * política de mismo origen. Si main.js no llega a ejecutarse, este script
 * muestra cómo iniciar un servidor local en lugar de dejar la pantalla vacía.
 */
(function () {
    'use strict';

    var FILE_PROTOCOL_DELAY_MS = 1500;
    var DEFAULT_DELAY_MS = 10000;

    function showStartupHelp() {
        if (document.documentElement.getAttribute('data-app-state')) return;
        var box = document.getElementById('startup-error');
        var message = document.getElementById('startup-error-message');
        var command = document.getElementById('startup-error-command');
        var loading = document.getElementById('loading-screen');
        if (!box || !message) return;
        if (location.protocol === 'file:') {
            message.textContent = 'El navegador bloquea los módulos JavaScript abiertos directamente como archivo. '
                + 'Inicie un servidor local en la carpeta del proyecto y abra http://localhost:8000';
            command.hidden = false;
        } else {
            message.textContent = 'El navegador no pudo cargar los módulos de la aplicación. '
                + 'Use una versión reciente de Chrome, Edge, Firefox o Safari.';
        }
        if (loading) loading.hidden = true;
        box.hidden = false;
    }

    window.addEventListener('load', function () {
        setTimeout(showStartupHelp, location.protocol === 'file:' ? FILE_PROTOCOL_DELAY_MS : DEFAULT_DELAY_MS);
    });
})();
