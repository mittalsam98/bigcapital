import React from 'react';
import withBreadcrumbs from 'react-router-breadcrumbs-hoc';
import { useHistory } from 'react-router-dom';
import routes from 'routes/dashboard';
import { If, Icon } from 'components';
import withDashboard from 'containers/Dashboard/withDashboard';
import { compose } from 'utils';

function DashboardBackLink({ dashboardBackLink, breadcrumbs }) {
  const history = useHistory();
  const crumb = breadcrumbs[breadcrumbs.length - 2];

  const handleClick = (event) => {
    const url =
      typeof dashboardBackLink === 'string'
        ? dashboardBackLink
        : crumb.match.url;
    history.push(url);
    event.preventDefault();
  };

  return (
    <If condition={dashboardBackLink && crumb}>
      <div class="dashboard__back-link">
        <a href="#no-link" onClick={handleClick}>
          <Icon icon={'arrow-left'} iconSize={18} /> Back to list.
        </a>
      </div>
    </If>
  );
}

export default compose(
  withBreadcrumbs(routes),
  withDashboard(({ dashboardBackLink }) => ({
    dashboardBackLink,
  })),
)(DashboardBackLink);
