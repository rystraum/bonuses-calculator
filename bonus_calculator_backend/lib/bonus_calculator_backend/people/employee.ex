defmodule BonusCalculatorBackend.People.Employee do
  use Ecto.Schema
  import Ecto.Changeset

  @classifications ["full_time", "contractual", "professional", "foreigner"]

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "employees" do
    field :name, :string
    field :classification, :string
    field :archived_at, :utc_datetime

    field :archived, :boolean, virtual: true

    belongs_to :archived_by, BonusCalculatorBackend.Accounts.User
    has_many :shareholders, BonusCalculatorBackend.People.Shareholder

    timestamps(type: :utc_datetime)
  end

  def classifications, do: @classifications

  def changeset(employee, attrs) do
    employee
    |> cast(attrs, [:name, :classification, :archived])
    |> validate_required([:name])
    |> validate_inclusion(:classification, @classifications)
  end

  def archive_changeset(employee, attrs, archived_by) do
    employee
    |> changeset(attrs)
    |> apply_archived(archived_by)
  end

  defp apply_archived(changeset, archived_by) do
    case get_change(changeset, :archived) do
      nil ->
        changeset

      true ->
        changeset
        |> put_change(:archived_at, DateTime.utc_now() |> DateTime.truncate(:second))
        |> put_change(:archived_by_id, archived_by && archived_by.id)

      false ->
        changeset
        |> put_change(:archived_at, nil)
        |> put_change(:archived_by_id, nil)
    end
  end
end
