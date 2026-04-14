import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgpSwitch, NgpSwitchThumb } from 'ng-primitives/switch';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-theme-toggle',
  imports: [NgpSwitch, NgpSwitchThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent {
  protected readonly themeService = inject(ThemeService);
}
