/**
 * @file launch-history.js
 * Diálogo "Historial de lanzamientos Starlink": resumen, lanzamientos por año
 * (también sirve de filtro), búsqueda, filtro por plataforma y tabla.
 * Al elegir una misión se notifica a la aplicación para seleccionarla.
 */
import { formatNumber, formatDate } from './format.js';

const byId = (id) => document.getElementById(id);

/** Nombre corto de la plataforma para la tabla ("SLC-40", "SLC-4E"...). */
const shortSiteName = (site) => site?.name.split(',')[0].split(' (')[0] ?? '—';

export class LaunchHistoryPanel {
    /**
     * @param {import('./satellites.js').SatelliteCatalog} catalog Catálogo con el historial.
     * @param {(launchId: string) => void} onSelect Acción al elegir una misión.
     */
    constructor(catalog, onSelect) {
        this.catalog = catalog;
        this.onSelect = onSelect;
        this.dialog = byId('history-dialog');
        this.filters = { year: null, query: '', site: '', trackedOnly: false };
        this.trackedCounts = new Map(catalog.launches.map((launch) => [launch.id, catalog.satellitesOfLaunch(launch.id).length]));

        this.renderSummary();
        this.renderSiteOptions();
        this.renderChart();
        this.bindEvents();
        this.renderRows();
    }

    open() {
        if (!this.dialog.open) this.dialog.showModal();
        byId('history-search').focus();
    }

    close() {
        if (this.dialog.open) this.dialog.close();
    }

    get isOpen() {
        return this.dialog.open;
    }

    renderSummary() {
        const launches = this.catalog.launches;
        const satellites = launches.reduce((sum, launch) => sum + launch.satellites, 0);
        const inOrbit = launches.reduce((sum, launch) => sum + launch.inOrbit, 0);
        const failures = launches.filter((launch) => launch.status !== 'success').length;
        byId('history-summary').textContent = `${formatNumber(launches.length, 0)} lanzamientos desde `
            + `${formatDate(new Date(launches[0].net))} · ${formatNumber(satellites, 0)} satélites lanzados · `
            + `${formatNumber(inOrbit, 0)} siguen en órbita · ${failures} fallo${failures === 1 ? '' : 's'}.`;
    }

    renderSiteOptions() {
        const select = byId('history-site');
        for (const [key, site] of Object.entries(this.catalog.sites)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = site.name;
            select.appendChild(option);
        }
    }

    /** Barras de lanzamientos por año; pulsar una barra filtra por ese año. */
    renderChart() {
        const perYear = new Map();
        for (const launch of this.catalog.launches) {
            const year = launch.net.slice(0, 4);
            perYear.set(year, (perYear.get(year) ?? 0) + 1);
        }
        const maximum = Math.max(...perYear.values());
        const chart = byId('history-chart');
        chart.replaceChildren(...[...perYear].map(([year, count]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'history-chart__bar';
            button.dataset.year = year;
            button.title = `${count} lanzamientos en ${year}`;
            button.innerHTML = '<span class="history-chart__count"></span><span class="history-chart__fill"></span><span class="history-chart__year"></span>';
            button.querySelector('.history-chart__count').textContent = count;
            button.querySelector('.history-chart__fill').style.height = `${Math.max(4, (count / maximum) * 100)}%`;
            button.querySelector('.history-chart__year').textContent = year;
            return button;
        }));
    }

    bindEvents() {
        byId('history-chart').addEventListener('click', (event) => {
            const bar = event.target.closest('[data-year]');
            if (!bar) return;
            this.filters.year = this.filters.year === bar.dataset.year ? null : bar.dataset.year;
            for (const element of byId('history-chart').children) {
                element.classList.toggle('is-active', element.dataset.year === this.filters.year);
            }
            this.renderRows();
        });
        byId('history-search').addEventListener('input', (event) => {
            this.filters.query = event.target.value.trim().toLowerCase();
            this.renderRows();
        });
        byId('history-site').addEventListener('change', (event) => {
            this.filters.site = event.target.value;
            this.renderRows();
        });
        byId('history-tracked').addEventListener('change', (event) => {
            this.filters.trackedOnly = event.target.checked;
            this.renderRows();
        });
        byId('history-rows').addEventListener('click', (event) => {
            const rowElement = event.target.closest('[data-launch]');
            if (!rowElement) return;
            this.close();
            this.onSelect(rowElement.dataset.launch);
        });
        byId('history-rows').addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.dataset.launch) event.target.click();
        });
    }

    matches(launch) {
        const { year, query, site, trackedOnly } = this.filters;
        return (!year || launch.net.startsWith(year))
            && (!site || launch.site === site)
            && (!trackedOnly || this.trackedCounts.get(launch.id) > 0)
            && (!query || launch.name.toLowerCase().includes(query) || launch.id.includes(query));
    }

    /** Tabla con las misiones filtradas, de la más reciente a la más antigua. */
    renderRows() {
        const launches = this.catalog.launches.filter((launch) => this.matches(launch)).reverse();
        byId('history-rows').replaceChildren(...launches.map((launch) => {
            const tracked = this.trackedCounts.get(launch.id);
            const rowElement = document.createElement('tr');
            rowElement.dataset.launch = launch.id;
            rowElement.tabIndex = 0;
            if (launch.status !== 'success') rowElement.classList.add('is-failure');
            const cells = [
                formatDate(new Date(launch.net)),
                `${launch.name}${launch.status !== 'success' ? ' · fallo' : ''}`,
                shortSiteName(this.catalog.sites[launch.site]),
                `${formatNumber(launch.inOrbit, 0)} / ${formatNumber(launch.satellites, 0)}${tracked ? ` · ${tracked} visibles` : ''}`,
                launch.inclination !== null ? `${formatNumber(launch.inclination, 1)}° · ${formatNumber(launch.perigee, 0)} km` : '—'
            ];
            rowElement.replaceChildren(...cells.map((text, index) => {
                const cell = document.createElement('td');
                cell.textContent = text;
                if (index === 1) cell.title = launch.id;
                return cell;
            }));
            return rowElement;
        }));
        byId('history-count').textContent = `${launches.length} misiones mostradas. Satélites: en órbita / lanzados; `
            + '"visibles" = con elementos orbitales para verlos en tiempo real.';
    }
}
