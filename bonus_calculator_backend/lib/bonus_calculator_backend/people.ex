defmodule BonusCalculatorBackend.People do
  @moduledoc """
  Employees and shareholders.
  """

  import Ecto.Query, warn: false

  alias BonusCalculatorBackend.People.{Employee, Shareholder}
  alias BonusCalculatorBackend.Repo

  def list_employees do
    Repo.all(from e in Employee, order_by: e.name)
  end

  def get_employee!(id), do: Repo.get!(Employee, id)

  def create_employee(attrs) do
    %Employee{}
    |> Employee.changeset(attrs)
    |> Repo.insert()
  end

  def update_employee(%Employee{} = employee, attrs) do
    employee
    |> Employee.changeset(attrs)
    |> Repo.update()
  end

  def delete_employee(%Employee{} = employee), do: Repo.delete(employee)

  def list_shareholders do
    Repo.all(from s in Shareholder, order_by: s.name, preload: :employee)
  end

  def get_shareholder!(id), do: Repo.get!(Shareholder, id)

  def create_shareholder(attrs) do
    %Shareholder{}
    |> Shareholder.changeset(attrs)
    |> Repo.insert()
  end

  def update_shareholder(%Shareholder{} = shareholder, attrs) do
    shareholder
    |> Shareholder.changeset(attrs)
    |> Repo.update()
  end

  def delete_shareholder(%Shareholder{} = shareholder), do: Repo.delete(shareholder)
end
