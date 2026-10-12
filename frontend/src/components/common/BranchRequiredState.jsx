import { useNavigate } from 'react-router-dom';
import EmptyState from './EmptyState';

export const BRANCH_REQUIRED_MESSAGE =
  'Create a branch first to manage tables, meals, categories, employees, offers, and coupons.';

export default function BranchRequiredState() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon="bi-building"
      title="No branch configured"
      description={BRANCH_REQUIRED_MESSAGE}
      buttonText="Manage Branches → Add Branch"
      onButtonClick={() => navigate('/admin/branches?add=1')}
    />
  );
}
