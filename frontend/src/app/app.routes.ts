import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/auth-layout/auth-layout.component').then(
        (m) => m.AuthLayoutComponent,
      ),
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login-page/login-page.component').then(
            (m) => m.LoginPageComponent,
          ),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register-page/register-page.component').then(
            (m) => m.RegisterPageComponent,
          ),
      },
    ],
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/dashboard-layout/dashboard-layout.component').then(
        (m) => m.DashboardLayoutComponent,
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'organizations',
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile-page/profile-page.component').then(
            (m) => m.ProfilePageComponent,
          ),
      },
      {
        path: 'organizations',
        loadComponent: () =>
          import(
            './features/organizations/organizations-page/organizations-page.component'
          ).then((m) => m.OrganizationsPageComponent),
      },
      {
        path: 'organizations/:id',
        loadComponent: () =>
          import(
            './features/organizations/organization-detail-page/organization-detail-page.component'
          ).then((m) => m.OrganizationDetailPageComponent),
      },
      {
        path: 'invitations',
        loadComponent: () =>
          import(
            './features/invitations/my-invitations-page/my-invitations-page.component'
          ).then((m) => m.MyInvitationsPageComponent),
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('./features/projects/projects-page/projects-page.component').then(
            (m) => m.ProjectsPageComponent,
          ),
      },
      {
        path: 'projects/:id/tasks',
        loadComponent: () =>
          import('./features/tasks/tasks-page/tasks-page.component').then(
            (m) => m.TasksPageComponent,
          ),
      },
      {
        path: 'projects/:id',
        loadComponent: () =>
          import('./features/projects/project-detail-page/project-detail-page.component')
            .then((m) => m.ProjectDetailPageComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'app',
  },
];
