defmodule BonusCalculatorBackend.Groups do
  @moduledoc """
  Employee groups and their memberships.
  """

  import Ecto.Query, warn: false

  alias BonusCalculatorBackend.Groups.{EmployeeGroup, EmployeeGroupMembership}
  alias BonusCalculatorBackend.Repo

  def list_employee_groups do
    Repo.all(from g in EmployeeGroup, order_by: g.name, preload: [employees: :archived_by])
  end

  def get_employee_group!(id) do
    Repo.get!(EmployeeGroup, id) |> Repo.preload(employees: :archived_by)
  end

  def create_employee_group(attrs) do
    %EmployeeGroup{}
    |> EmployeeGroup.changeset(attrs)
    |> Repo.insert()
  end

  def update_employee_group(%EmployeeGroup{} = group, attrs) do
    group
    |> EmployeeGroup.changeset(attrs)
    |> Repo.update()
  end

  def delete_employee_group(%EmployeeGroup{} = group), do: Repo.delete(group)

  def add_member(%EmployeeGroup{} = group, employee_id) do
    %EmployeeGroupMembership{}
    |> EmployeeGroupMembership.changeset(%{
      employee_id: employee_id,
      employee_group_id: group.id
    })
    |> Repo.insert()
  end

  def remove_member(%EmployeeGroup{} = group, employee_id) do
    case Repo.get_by(EmployeeGroupMembership,
           employee_id: employee_id,
           employee_group_id: group.id
         ) do
      nil -> {:error, :not_found}
      membership -> Repo.delete(membership)
    end
  end
end
