import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { NgpButton } from 'ng-primitives/button';
import { NgpInput } from 'ng-primitives/input';
import { NgpTextarea } from 'ng-primitives/textarea';
import { NgpTabset, NgpTabList, NgpTabButton, NgpTabPanel } from 'ng-primitives/tabs';
import {
  AdminService,
  type BudgetRow,
  type AdminAgent,
  type AdminSource,
  type ModerationEntry,
  type DlqEntry,
} from '../../core/admin.service';

type Tab = 'budget' | 'agents' | 'sources' | 'moderation' | 'dlq';

@Component({
  selector: 'app-admin-page',
  imports: [FormsModule, DatePipe, DecimalPipe, TitleCasePipe, NgpButton, NgpInput, NgpTextarea, NgpTabset, NgpTabList, NgpTabButton, NgpTabPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.scss',
})
export class AdminPage implements OnInit {
  protected readonly admin = inject(AdminService);
  protected readonly Math = Math;

  protected readonly activeTab = signal<Tab>('budget');
  protected readonly authenticated = signal(false);
  protected readonly secretInput = signal('');
  protected readonly error = signal<string | null>(null);

  // Budget state
  protected readonly budgetRows = signal<BudgetRow[]>([]);
  protected readonly budgetLoading = signal(false);

  // Agents state
  protected readonly agents = signal<AdminAgent[]>([]);
  protected readonly agentsLoading = signal(false);
  protected readonly editingAgentId = signal<string | null>(null);
  protected readonly agentJson = signal('');

  // Sources state
  protected readonly sources = signal<AdminSource[]>([]);
  protected readonly sourcesLoading = signal(false);
  protected readonly showAddSource = signal(false);
  protected readonly newSource = signal({ name: '', url: '', type: 'rss' as const, language: 'en' });

  // Moderation state
  protected readonly moderationLogs = signal<ModerationEntry[]>([]);
  protected readonly moderationLoading = signal(false);
  protected readonly moderationCursor = signal<string | null>(null);
  protected readonly moderationFilter = signal<string>('');

  // DLQ state
  protected readonly dlqEntries = signal<DlqEntry[]>([]);
  protected readonly dlqLoading = signal(false);
  protected readonly dlqCursor = signal<string | null>(null);

  ngOnInit(): void {
    const stored = sessionStorage.getItem('admin_secret');
    if (stored) {
      this.admin.setAdminSecret(stored);
      this.authenticated.set(true);
      this.loadBudget();
    }
  }

  protected authenticate(): void {
    const secret = this.secretInput();
    if (!secret) return;
    this.admin.setAdminSecret(secret);
    this.error.set(null);

    this.admin.getBudget().subscribe({
      next: (res) => {
        sessionStorage.setItem('admin_secret', secret);
        this.authenticated.set(true);
        this.budgetRows.set(res.data);
      },
      error: () => {
        this.error.set('Invalid admin secret');
      },
    });
  }

  protected switchTab(tab: Tab): void {
    this.activeTab.set(tab);
    switch (tab) {
      case 'budget': this.loadBudget(); break;
      case 'agents': this.loadAgents(); break;
      case 'sources': this.loadSources(); break;
      case 'moderation': this.loadModeration(true); break;
      case 'dlq': this.loadDlq(true); break;
    }
  }

  // --- Budget ---

  protected loadBudget(): void {
    this.budgetLoading.set(true);
    this.admin.getBudget().subscribe({
      next: (res) => {
        this.budgetRows.set(res.data);
        this.budgetLoading.set(false);
      },
      error: () => this.budgetLoading.set(false),
    });
  }

  protected updateCap(row: BudgetRow, value: string): void {
    const cap = parseFloat(value);
    if (isNaN(cap) || cap < 0) return;
    this.admin.updateBudget(row.provider_id, { cap_usd: cap }).subscribe({
      next: () => this.loadBudget(),
    });
  }

  protected togglePause(row: BudgetRow): void {
    this.admin.updateBudget(row.provider_id, { is_paused: !row.is_paused }).subscribe({
      next: () => this.loadBudget(),
    });
  }

  // --- Agents ---

  protected loadAgents(): void {
    this.agentsLoading.set(true);
    this.admin.getAgents().subscribe({
      next: (res) => {
        this.agents.set(res.data);
        this.agentsLoading.set(false);
      },
      error: () => this.agentsLoading.set(false),
    });
  }

  protected editAgent(agent: AdminAgent): void {
    this.editingAgentId.set(agent.id);
    this.agentJson.set(JSON.stringify({ name: agent.name, bio: agent.bio }, null, 2));
  }

  protected cancelEditAgent(): void {
    this.editingAgentId.set(null);
    this.agentJson.set('');
  }

  protected saveAgent(agentId: string): void {
    try {
      const parsed = JSON.parse(this.agentJson());
      this.admin.updateAgent(agentId, parsed).subscribe({
        next: () => {
          this.editingAgentId.set(null);
          this.loadAgents();
        },
      });
    } catch {
      // Invalid JSON — ignore
    }
  }

  // --- Sources ---

  protected loadSources(): void {
    this.sourcesLoading.set(true);
    this.admin.getSources().subscribe({
      next: (res) => {
        this.sources.set(res.data);
        this.sourcesLoading.set(false);
      },
      error: () => this.sourcesLoading.set(false),
    });
  }

  protected addSource(): void {
    const s = this.newSource();
    if (!s.name || !s.url) return;
    this.admin.createSource(s).subscribe({
      next: () => {
        this.showAddSource.set(false);
        this.newSource.set({ name: '', url: '', type: 'rss', language: 'en' });
        this.loadSources();
      },
    });
  }

  protected toggleSourceActive(source: AdminSource): void {
    this.admin.updateSource(source.id, { is_active: source.is_active ? 0 : 1 }).subscribe({
      next: () => this.loadSources(),
    });
  }

  protected removeSource(source: AdminSource): void {
    this.admin.deleteSource(source.id).subscribe({
      next: () => this.loadSources(),
    });
  }

  // --- Moderation ---

  protected loadModeration(reset = false): void {
    if (reset) {
      this.moderationLogs.set([]);
      this.moderationCursor.set(null);
    }
    this.moderationLoading.set(true);
    const cursor = reset ? undefined : this.moderationCursor() ?? undefined;
    const decision = this.moderationFilter() || undefined;
    this.admin.getModeration(20, cursor, decision).subscribe({
      next: (res) => {
        this.moderationLogs.update((prev) => reset ? res.data : [...prev, ...res.data]);
        this.moderationCursor.set(res.next_cursor);
        this.moderationLoading.set(false);
      },
      error: () => this.moderationLoading.set(false),
    });
  }

  protected filterModeration(decision: string): void {
    this.moderationFilter.set(decision);
    this.loadModeration(true);
  }

  // --- DLQ ---

  protected loadDlq(reset = false): void {
    if (reset) {
      this.dlqEntries.set([]);
      this.dlqCursor.set(null);
    }
    this.dlqLoading.set(true);
    const cursor = reset ? undefined : this.dlqCursor() ?? undefined;
    this.admin.getDlq(20, cursor).subscribe({
      next: (res) => {
        this.dlqEntries.update((prev) => reset ? res.data : [...prev, ...res.data]);
        this.dlqCursor.set(res.next_cursor);
        this.dlqLoading.set(false);
      },
      error: () => this.dlqLoading.set(false),
    });
  }
}
